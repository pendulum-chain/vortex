# Node.js Bridge Solution

## Problem

The original goal was to wrap the TypeScript Vortex SDK for Python using PythonMonkey. However, PythonMonkey has significant limitations:

1. **No ES6 modules support** - Can't use `import` statements
2. **No Node.js built-ins** - Can't use `node:util`, `node:crypto`, etc.
3. **Async/await causes segfaults** - The SDK heavily uses async operations
4. **Limited JavaScript compatibility** - Uses SpiderMonkey, not a full Node.js runtime

## Solution: Node.js Subprocess Bridge

Instead of embedding JavaScript in Python, we spawn Node.js as a subprocess to execute SDK methods. This provides:

✅ **Full Node.js compatibility** - All built-in modules work
✅ **Native async/await support** - No segmentation faults
✅ **Easy installation** - Just `npm install @vortexfi/sdk` + `pip install`
✅ **No local builds required** - Uses published npm package directly

## How It Works

```python
# Python side
sdk = VortexSDK({"apiBaseUrl": "https://api.vortex.pendulumchain.org"})
quote = sdk.create_quote(request)
```

```javascript
// Node.js subprocess (invisible to user)
(async () => {
    const { VortexSdk } = require('@vortexfi/sdk');
    const sdk = new VortexSdk(config);
    const result = await sdk.createQuote(...args);
    console.log(JSON.stringify({ success: true, result }));
})();
```

The Python wrapper captures the JSON output and returns it as Python objects.

## Key Implementation Details

### 1. Clean stdout/stderr separation

SDK debug logs are redirected to stderr, keeping stdout clean for JSON:

```javascript
// Redirect console.log to stderr
const originalLog = console.log;
console.log = (...args) => console.error(...args);

// SDK code runs here with logs going to stderr

// Restore and output JSON to stdout
console.log = originalLog;
console.log(JSON.stringify({ success: true, result }));
```

### 2. Error Handling

Errors are captured and formatted as JSON in stderr:

```javascript
catch (error) {
    console.error(JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
    }));
    process.exit(1);
}
```

### 3. Type Conversion

Python objects are serialized to JSON, passed to Node.js, and results are deserialized back:

```python
# Python → JSON → Node.js → JSON → Python
args_json = json.dumps(args)
result = subprocess.run(["node", "-e", script], ...)
response = json.loads(result.stdout)
```

## Performance Considerations

- **Startup overhead**: ~100-200ms per subprocess spawn
- **Good for**: Interactive scripts, periodic tasks, API calls
- **Not ideal for**: High-frequency operations (>10/sec)

For high-throughput scenarios, consider:
- Batching requests
- Long-running Node.js process with IPC
- Full Python rewrite

## Installation

```bash
# Install Node.js SDK
cd pythonmonkey-sdk
npm install

# Install Python package
pip install -e .
```

## Testing

```bash
# Run test script
python examples/brl_onramp_example.py

# Run diagnostic
python test_bridge.py
```

## Future Improvements

- [ ] Connection pooling for long-running Node.js processes
- [ ] Better error messages with stack traces
- [ ] Async Python methods using subprocess async APIs
- [ ] Batch operation support
- [ ] Optional caching layer
