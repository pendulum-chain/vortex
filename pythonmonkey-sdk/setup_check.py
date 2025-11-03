#!/usr/bin/env python3
"""
Check if the environment is properly set up for the Vortex SDK Python wrapper.
"""

import sys
import os
from pathlib import Path

print("Checking Vortex SDK Python wrapper setup...\n")

# Check 1: Python version
print("1. Python version:")
py_version = sys.version_info
if py_version >= (3, 9):
    print(f"   ✓ Python {py_version.major}.{py_version.minor}.{py_version.micro}")
else:
    print(f"   ✗ Python {py_version.major}.{py_version.minor}.{py_version.micro} (need 3.9+)")
    sys.exit(1)

# Check 2: Node.js
print("\n2. Node.js:")
node_check = os.system("node --version > /dev/null 2>&1")
if node_check == 0:
    os.system("echo '   ✓ Node.js' $(node --version)")
else:
    print("   ✗ Node.js not found (need v18+)")
    sys.exit(1)

# Check 3: PythonMonkey
print("\n3. PythonMonkey:")
try:
    import pythonmonkey as pm
    print(f"   ✓ PythonMonkey installed")
    # Check if pm.require exists
    if hasattr(pm, 'require'):
        print("   ✓ pm.require available")
    else:
        print("   ⚠ pm.require not available (will use fallback)")
except ImportError:
    print("   ✗ PythonMonkey not installed")
    print("   Run: pip install pythonmonkey")
    sys.exit(1)

# Check 4: npm packages
print("\n4. Node.js dependencies:")
project_root = Path(__file__).parent
node_modules = project_root / "node_modules"
sdk_path = node_modules / "@vortexfi" / "sdk"

if node_modules.exists():
    print(f"   ✓ node_modules exists")
    if sdk_path.exists():
        sdk_index = sdk_path / "dist" / "index.js"
        if sdk_index.exists():
            print(f"   ✓ @vortexfi/sdk installed at {sdk_index}")
        else:
            print(f"   ✗ @vortexfi/sdk dist/index.js not found")
            print("   Run: npm install")
            sys.exit(1)
    else:
        print("   ✗ @vortexfi/sdk not found")
        print("   Run: npm install")
        sys.exit(1)
else:
    print("   ✗ node_modules not found")
    print("   Run: npm install")
    sys.exit(1)

# Check 5: Vortex SDK module
print("\n5. Vortex SDK Python module:")
try:
    from vortex_sdk import VortexSDK, FiatToken, EvmToken, Networks
    print("   ✓ vortex_sdk module imported")
    print("   ✓ Constants available (FiatToken, EvmToken, Networks)")
except ImportError as e:
    print(f"   ✗ Failed to import: {e}")
    sys.exit(1)

print("\n" + "="*60)
print("✓ All checks passed!")
print("="*60)
print("\nYou can now use the Vortex SDK:")
print("  python examples/brl_onramp_example.py")
