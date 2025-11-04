"""
Node.js bridge - executes SDK via subprocess instead of PythonMonkey.
This avoids PythonMonkey's Node.js built-in limitations.
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import Dict, Any, Optional

from .exceptions import VortexSDKError


class NodeBridge:
    """Bridge to execute Vortex SDK via Node.js subprocess."""
    
    def __init__(self, sdk_config: Dict[str, Any]):
        """Initialize the Node.js bridge."""
        self.sdk_config = sdk_config
        self._verify_node()
        self._find_sdk()
    
    def _verify_node(self) -> None:
        """Verify Node.js is available."""
        try:
            result = subprocess.run(
                ["node", "--version"],
                capture_output=True,
                text=True,
                check=True
            )
            version = result.stdout.strip()
            # Check version is 18+
            major = int(version.lstrip('v').split('.')[0])
            if major < 18:
                raise VortexSDKError(f"Node.js 18+ required, found {version}")
        except (subprocess.CalledProcessError, FileNotFoundError):
            raise VortexSDKError(
                "Node.js 18+ is required but not found. "
                "Install from https://nodejs.org/"
            )
    
    def _find_sdk(self) -> None:
        """Find the npm-installed SDK."""
        project_root = Path(__file__).parent.parent.parent
        sdk_path = project_root / "node_modules" / "@vortexfi" / "sdk"
        
        if not sdk_path.exists():
            raise VortexSDKError(
                "@vortexfi/sdk not found. Run: npm install"
            )
    
    def call_method(self, method: str, *args, timeout: int = 60) -> Any:
        """Call a SDK method via Node.js.
        
        Args:
            method: SDK method name
            *args: Method arguments
            timeout: Timeout in seconds (default 60, use higher for registerRamp)
        """
        script = f"""
        import {{ VortexSdk }} from "@vortexfi/sdk";
        (async () => {{
            
            try {{
                // Redirect console.log to stderr to keep stdout clean for JSON only
                const originalLog = console.log;
                console.log = (...args) => console.error(...args);
                
        
                
                const config = {json.dumps(self.sdk_config)};
                const sdk = new VortexSdk(config);
                
                const methodArgs = {json.dumps(args)};
                
                const result = await sdk.{method}(...methodArgs);
                
                // Restore console.log and output JSON to stdout
                console.log = originalLog;
                console.log(JSON.stringify({{ success: true, result }}));
                process.exit(0);
            }} catch (error) {{
                console.error(JSON.stringify({{
                    success: false,
                    error: error.message,
                    stack: error.stack
                }}));
                process.exit(1);
            }}
        }})();
        """
        cmd = ["node", "--input-type=module", "-e", script]
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=True,  # This will raise CalledProcessError if node exits with 1
                encoding='utf-8'
            )
        
            # Success: parse the JSON from stdout
            return json.loads(result.stdout)

        except subprocess.CalledProcessError as e:
            # This block is the fix.
            # The Node.js script failed (exit 1) and printed JSON to stderr.
            try:
                # Try to parse the JSON error from stderr
                error_data = json.loads(e.stderr)
                error_msg = error_data.get('error', 'Unknown SDK Error')
                error_stack = error_data.get('stack', 'No stack trace')
                # Raise the specific error from the JS side
                raise VortexSDKError(f"SDK Error: {error_msg}\nStack: {error_stack}") from e
            except json.JSONDecodeError:
                # If stderr wasn't JSON, just raise the raw output
                raise VortexSDKError(f"Bridge Error (non-JSON): {str(e)}\nSTDOUT: {e.stdout}\nSTDERR: {e.stderr}") from e
        
        except subprocess.TimeoutExpired as e:
            raise VortexSDKError(f"SDK method '{method}' timed out after {timeout} seconds.") from e
        except Exception as e:
            # Catch any other unexpected errors
            raise VortexSDKError(f"An unexpected error occurred: {str(e)}") from e
