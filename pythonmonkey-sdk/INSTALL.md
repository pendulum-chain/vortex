# Installation Guide

This guide will help you install and set up the Vortex SDK Python wrapper.

## Prerequisites

Before installing the Vortex SDK Python wrapper, ensure you have:

1. **Python 3.9 or higher**
   ```bash
   python --version  # Should be 3.9 or higher
   ```

2. **Node.js 18 or higher** (required by PythonMonkey)
   ```bash
   node --version  # Should be v18.0.0 or higher
   ```

3. **The compiled Vortex SDK** (TypeScript/JavaScript)

## Step-by-Step Installation

### 1. Install the Vortex SDK via npm

The Python wrapper requires the Vortex SDK. Version 0.4.0+ includes both ESM and CommonJS formats.

```bash
# Navigate to the pythonmonkey-sdk directory
cd pythonmonkey-sdk

# Install Node.js dependencies (including @vortexfi/sdk)
npm install
```

This will install the Vortex SDK from npm. PythonMonkey will automatically use the CommonJS version.

### 2. Install Python Dependencies

Navigate to the pythonmonkey-sdk directory:

```bash
cd ../../pythonmonkey-sdk
```

Create a virtual environment (recommended):

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Linux/macOS:
source venv/bin/activate

# On Windows:
venv\Scripts\activate
```

Install the package in development mode:

```bash
pip install -e .
```

Or install with development dependencies:

```bash
pip install -e ".[dev]"
```

### 3. Verify Installation

Test the installation:

```bash
python -c "from vortex_sdk import VortexSDK; print('✓ Vortex SDK imported successfully')"
```

## Installation Methods

### Method 1: Standard Installation (Recommended)

```bash
# Clone the repository
git clone https://github.com/pendulum-chain/vortex.git
cd vortex/pythonmonkey-sdk

# Install Vortex SDK from npm
npm install

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Install Python wrapper
pip install -e .
```

### Method 2: Development Installation (with dev dependencies)

```bash
cd pythonmonkey-sdk

# Install npm dependencies
npm install

# Install Python wrapper with dev tools
python -m venv venv
source venv/bin/activate
pip install -e ".[dev]"
```

### Method 3: Global npm installation

If you prefer a global installation of the SDK:

```bash
# Install SDK globally
npm install -g @vortexfi/sdk

# Install Python wrapper
cd pythonmonkey-sdk
python -m venv venv
source venv/bin/activate
pip install -e .
```

### Method 4: Direct pip install (when published to PyPI)

```bash
# Install from PyPI (future)
pip install vortex-sdk-python

# Still need to install the JS SDK
npm install -g @vortexfi/sdk
```

## Configuration

### Setting SDK Path

If the SDK is not in the default location (`packages/sdk/dist/index.js`), you can set the path via environment variable:

```bash
export VORTEX_SDK_PATH="/path/to/vortex/sdk/dist/index.js"
```

Or in Python:

```python
import os
os.environ['VORTEX_SDK_PATH'] = '/path/to/vortex/sdk/dist/index.js'

from vortex_sdk import VortexSDK
```

### Using npm-installed SDK

If you have the SDK installed via npm globally or in a project:

```bash
npm install -g @vortexfi/sdk
# or
npm install @vortexfi/sdk
```

The Python wrapper will automatically find it via Node.js require resolution.

## Troubleshooting

### Issue: PythonMonkey installation fails

**Solution:** Install build dependencies

On Ubuntu/Debian:
```bash
sudo apt-get update
sudo apt-get install python3-dev build-essential
```

On macOS:
```bash
# Install Xcode Command Line Tools
xcode-select --install
```

On Windows:
- Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/)
- Select "Desktop development with C++" workload

### Issue: "Could not find Vortex SDK"

**Solutions:**

1. Install the SDK via npm:
   ```bash
   cd pythonmonkey-sdk
   npm install
   ```

2. Verify the installation:
   ```bash
   ls node_modules/@vortexfi/sdk/dist/index.js
   ```

3. Or install globally:
   ```bash
   npm install -g @vortexfi/sdk
   ```

4. Set the VORTEX_SDK_PATH environment variable (if using custom location):
   ```bash
   export VORTEX_SDK_PATH="/path/to/sdk/dist/index.js"
   ```

### Issue: Import errors

**Solution:** Make sure you're in the virtual environment:

```bash
# Check if venv is activated
which python  # Should point to venv/bin/python

# If not activated:
source venv/bin/activate  # Linux/macOS
# or
venv\Scripts\activate  # Windows
```

### Issue: Node.js not found

**Solution:** Install Node.js 18 or higher:

- Visit https://nodejs.org/
- Download and install the LTS version
- Verify: `node --version`

### Issue: Module 'pythonmonkey' has no attribute 'eval'

**Solution:** Update PythonMonkey to the latest version:

```bash
pip install --upgrade pythonmonkey
```

## Platform-Specific Notes

### macOS (Apple Silicon M1/M2)

PythonMonkey might need architecture specification:

```bash
arch -arm64 pip install pythonmonkey
```

### Windows

- Ensure you have Visual C++ Build Tools installed
- Use PowerShell or Command Prompt (not Git Bash) for activation
- Path separators use backslashes (`\`)

### Linux

Some distributions might need additional packages:

```bash
# Fedora/RHEL
sudo dnf install python3-devel gcc

# Arch Linux
sudo pacman -S python gcc
```

## Running Examples

After successful installation, run the examples:

```bash
# BRL Onramp example
python examples/brl_onramp_example.py

# BRL Offramp example
python examples/brl_offramp_example.py

# Async example
python examples/async_example.py
```

## Uninstallation

To uninstall:

```bash
pip uninstall vortex-sdk-python
```

To completely clean up:

```bash
# Deactivate virtual environment
deactivate

# Remove virtual environment
rm -rf venv

# Remove build artifacts
rm -rf build dist *.egg-info
```

## Next Steps

- Read the [README.md](README.md) for usage examples
- Check the [examples/](examples/) directory for more code samples
- Visit the [documentation](https://docs.vortex.pendulumchain.tech)

## Getting Help

If you encounter issues not covered here:

1. Check existing [GitHub Issues](https://github.com/pendulum-chain/vortex/issues)
2. Create a new issue with:
   - Your Python version (`python --version`)
   - Your Node.js version (`node --version`)
   - Your OS and version
   - Full error message and traceback
   - Steps to reproduce

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development setup and contribution guidelines.
