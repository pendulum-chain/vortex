# Troubleshooting Guide

Common issues and solutions for the Vortex SDK Python wrapper.

## Import Errors

### Error: "Could not find Vortex SDK"

**Cause:** The compiled TypeScript SDK is not found.

**Solution:**
```bash
# Build the SDK
cd packages/sdk
bun install
bun run build

# Verify the build
ls -la dist/index.js  # Should exist

# Try again
cd ../../pythonmonkey-sdk
python test_import.py
```

### Error: "SyntaxError: import declarations may only appear at top level"

**Cause:** ES6 module syntax issue (should be fixed in latest version).

**Solution:**
This has been fixed. If you still see this:
1. Pull the latest code
2. Reinstall: `pip install -e . --force-reinstall`

### Error: "Module 'pythonmonkey' has no attribute 'eval'"

**Cause:** PythonMonkey not installed or wrong version.

**Solution:**
```bash
pip install --upgrade pythonmonkey>=0.6.0
```

## Runtime Errors

### Error: "Promise rejected"

**Cause:** The underlying JavaScript promise was rejected, often due to API errors.

**Solution:**
1. Check your API endpoint is correct
2. Verify network connectivity
3. Check API response in browser: `https://your-api-url/health`
4. Enable verbose error messages:
   ```python
   import logging
   logging.basicConfig(level=logging.DEBUG)
   ```

### Error: "Failed to initialize Vortex SDK"

**Cause:** Various initialization issues.

**Solutions:**

1. **Check SDK path:**
   ```python
   import os
   os.environ['VORTEX_SDK_PATH'] = '/full/path/to/packages/sdk/dist/index.js'
   from vortex_sdk import VortexSDK
   ```

2. **Verify Node.js:**
   ```bash
   node --version  # Should be v18+
   ```

3. **Check file permissions:**
   ```bash
   ls -la packages/sdk/dist/index.js
   chmod +r packages/sdk/dist/index.js
   ```

## Platform-Specific Issues

### macOS: "Symbol not found" or dylib errors

**Solution:**
```bash
# Reinstall with architecture flag
arch -arm64 pip install pythonmonkey --force-reinstall  # For M1/M2
# or
arch -x86_64 pip install pythonmonkey --force-reinstall  # For Intel
```

### Windows: "Cannot find module"

**Solution:**
1. Use forward slashes or raw strings for paths:
   ```python
   os.environ['VORTEX_SDK_PATH'] = r'C:\path\to\sdk\dist\index.js'
   # or
   os.environ['VORTEX_SDK_PATH'] = 'C:/path/to/sdk/dist/index.js'
   ```

2. Ensure Node.js is in PATH:
   ```cmd
   where node
   ```

### Linux: "libpython not found"

**Solution:**
```bash
# Ubuntu/Debian
sudo apt-get install python3-dev

# Fedora
sudo dnf install python3-devel

# Then reinstall
pip install pythonmonkey --force-reinstall
```

## API Errors

### Error: "Failed to create quote"

**Causes:**
- Invalid amount format
- Unsupported currency pair
- Network not available

**Solutions:**
1. **Check amount format:**
   ```python
   # Wrong
   amount = "100.00"
   
   # Correct (in smallest unit)
   amount = "10000"  # For BRL (cents)
   amount = "1000000"  # For USDC (6 decimals)
   ```

2. **Verify currency pair:**
   ```python
   from vortex_sdk import FiatToken, EvmToken
   
   # Supported pairs
   print(f"BRL: {FiatToken.BRL}")
   print(f"USDC: {EvmToken.USDC}")
   ```

3. **Test API directly:**
   ```bash
   curl https://api.vortex.pendulumchain.tech/health
   ```

### Error: "Failed to register ramp"

**Causes:**
- Missing required fields
- Invalid address format
- Invalid tax ID format

**Solutions:**
1. **Verify all required fields:**
   ```python
   # For BRL onramp
   data = {
       "destinationAddress": "0x...",  # Valid EVM address
       "taxId": "123.456.789-00"       # Valid CPF format
   }
   
   # For BRL offramp
   data = {
       "pixDestination": "email@example.com",
       "receiverTaxId": "123.456.789-00",
       "taxId": "123.456.789-00",
       "walletAddress": "0x..."
   }
   ```

2. **Validate address:**
   ```python
   address = "0x1234567890123456789012345678901234567890"
   assert len(address) == 42
   assert address.startswith("0x")
   ```

## Testing Issues

### Tests fail with "Mock not found"

**Solution:**
```bash
pip install pytest pytest-asyncio
pytest tests/ -v
```

### Import errors in tests

**Solution:**
```bash
# Install in development mode
pip install -e ".[dev]"

# Run from project root
cd pythonmonkey-sdk
pytest tests/
```

## Performance Issues

### Slow initialization

**Cause:** Network manager initialization.

**Solution:**
Initialization happens once. Reuse the SDK instance:
```python
# Good
sdk = VortexSDK(config)
quote1 = sdk.create_quote(req1)
quote2 = sdk.create_quote(req2)

# Bad - creates new instance each time
sdk1 = VortexSDK(config)
quote1 = sdk1.create_quote(req1)
sdk2 = VortexSDK(config)  # Unnecessary
quote2 = sdk2.create_quote(req2)
```

### Memory leaks

**Solution:**
Use context managers for long-running processes:
```python
def process_ramp():
    sdk = VortexSDK(config)
    # ... do work
    # SDK will be garbage collected when function returns
```

## Debugging Tips

### Enable debug logging

```python
import logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
```

### Inspect SDK state

```python
# Check if SDK loaded
print(f"SDK instance: {sdk}")
print(f"SDK module: {dir(sdk._sdk)}")
```

### Test JavaScript execution

```python
import pythonmonkey as pm
result = pm.eval("1 + 1")
print(f"PM works: {result}")  # Should print 2
```

### Check environment

```python
import os
import sys

print(f"Python: {sys.version}")
print(f"CWD: {os.getcwd()}")
print(f"SDK PATH: {os.environ.get('VORTEX_SDK_PATH', 'Not set')}")
```

## Getting More Help

If your issue isn't listed here:

1. **Run the test script:**
   ```bash
   python test_import.py
   ```

2. **Check GitHub Issues:**
   https://github.com/pendulum-chain/vortex/issues

3. **Create a new issue with:**
   - Python version: `python --version`
   - Node.js version: `node --version`
   - OS and version
   - Full error message
   - Minimal reproduction code

4. **Join the community:**
   - [Discord](https://discord.gg/pendulum)
   - [Telegram](https://t.me/pendulum_community)
