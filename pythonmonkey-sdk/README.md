# Vortex SDK - Python Wrapper

A Python wrapper for the Vortex SDK enabling cross-chain ramp operations from Python applications.

## Overview

This package wraps the TypeScript/JavaScript Vortex SDK using Node.js subprocess execution, allowing Python developers to interact with Vortex's API for on-ramp and off-ramp operations.

## Installation

### Prerequisites
- Python 3.9+
- Node.js 18+

### Install

```bash
git clone https://github.com/pendulum-chain/vortex.git
cd vortex/pythonmonkey-sdk

# Install the Vortex SDK
npm install

# Install Python package
pip install -e .
```

### Install from PyPI (when published)

```bash
pip install vortex-sdk-python
npm install @vortexfi/sdk
```

## Quick Start

```python
from vortex_sdk import VortexSDK, FiatToken, EvmToken, Networks

config = {
    "apiBaseUrl": "https://api.vortex.pendulumchain.tech"
}

sdk = VortexSDK(config)

quote = sdk.create_quote({
    "from": "pix",
    "inputAmount": "150000",
    "inputCurrency": FiatToken.BRL,
    "outputCurrency": EvmToken.USDC,
    "rampType": "on",
    "to": Networks.Polygon
})

print(f"Quote ID: {quote['id']}")

result = sdk.register_ramp(quote, {
    "destinationAddress": "0x1234567890123456789012345678901234567890",
    "taxId": "123.456.789-00"
})

print(f"Deposit QR Code: {result['rampProcess']['depositQrCode']}")

# After PIX payment
sdk.start_ramp(result['rampProcess']['id'])
```

## Core Features
- **Simple Installation**: Just `npm install` + `pip install`
- **No Build Required**: Works with npm-published SDK
- **Full Compatibility**: Uses Node.js subprocess for complete SDK support
- **Async Support**: Both sync and async methods available
- **Type Hints**: Full type annotations for IDE support

## API Reference

See [Full Documentation](https://docs.vortex.pendulumchain.tech) for complete API reference.

### Key Methods
- `create_quote(request)` - Create a new quote
- `get_quote(quote_id)` - Get existing quote
- `register_ramp(quote, data)` - Register ramp process
- `start_ramp(ramp_id)` - Start the ramp
- `get_ramp_status(ramp_id)` - Check ramp status

All methods have async versions: `create_quote_async()`, etc.

## Examples

See `examples/` directory for complete code samples:
- `brl_onramp_example.py` - PIX to USDC
- `brl_offramp_example.py` - USDC to PIX  
- `async_example.py` - Async/await usage

## Development

```bash
pip install -e ".[dev]"
pytest tests/
```

## Links

- [GitHub](https://github.com/pendulum-chain/vortex)
- [Documentation](https://docs.vortex.pendulumchain.tech)
- [npm SDK](https://www.npmjs.com/package/@vortexfi/sdk)
