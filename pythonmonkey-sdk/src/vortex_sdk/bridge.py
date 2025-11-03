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
    
    def call_method(self, method: str, *args) -> Any:
        """Call a SDK method via Node.js."""
        script = f"""
        (async () => {{
            try {{
                const {{ VortexSdk }} = require('@vortexfi/sdk');
                
                const config = {json.dumps(self.sdk_config)};
                const sdk = new VortexSdk(config);
                
                const args = {json.dumps(args)};
                
                const result = await sdk.{method}(...args);
                console.log(JSON.stringify({{ success: true, result }}));
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
        
        try:
            result = subprocess.run(
                ["node", "-e", script],
                capture_output=True,
                text=True,
                check=False,
                cwd=str(Path(__file__).parent.parent.parent)
            )
            
            # Check stderr for error output
            if result.stderr and result.returncode != 0:
                try:
                    error_data = json.loads(result.stderr)
                    raise VortexSDKError(f"SDK error: {error_data.get('error', 'Unknown error')}")
                except json.JSONDecodeError:
                    raise VortexSDKError(f"Node.js error: {result.stderr}")
            
            if not result.stdout:
                raise VortexSDKError(
                    f"No output from Node.js. "
                    f"stderr: {result.stderr or '(empty)'}, "
                    f"return code: {result.returncode}"
                )
            
            response = json.loads(result.stdout)
            if not response.get('success'):
                raise VortexSDKError(f"SDK error: {response.get('error')}")
            
            return response['result']
            
        except json.JSONDecodeError as e:
            raise VortexSDKError(
                f"Failed to parse response. "
                f"stdout: {result.stdout[:200]}, "
                f"stderr: {result.stderr[:200]}"
            )
        except Exception as e:
            if isinstance(e, VortexSDKError):
                raise
            raise VortexSDKError(f"Bridge error: {str(e)}") from e
