# Vortex SDK - Python Wrapper

A Python wrapper for the Vortex SDK using PythonMonkey, enabling cross-chain ramp operations from Python applications.

## Overview

This package wraps the TypeScript/JavaScript Vortex SDK using PythonMonkey, allowing Python developers to interact with Vortex's API for on-ramp and off-ramp operations without needing to rewrite the entire SDK.

## Installation

### Prerequisites

- Python 3.9 or higher
- Node.js 18 or higher (required by PythonMonkey)
- The compiled Vortex SDK package

### Install from source

```bash
# Clone the repository
git clone https://github.com/pendulum-chain/vortex.git
cd vortex/pythonmonkey-sdk

# Install the Vortex SDK from npm
npm install

# Install the Python wrapper
pip install -e .
```

### Install from PyPI (when published)

```bash
# Install Python package
pip install vortex-sdk-python

# Install the Vortex SDK
npm install -g @vortexfi/sdk
```

## Quick Start

```python
from vortex_sdk import VortexSDK, QuoteRequest, FiatToken, EvmToken, Networks

# Initialize the SDK
config = {
    "apiBaseUrl": "https://api.vortex.pendulumchain.tech"
}

sdk = VortexSDK(config)

# Create a quote for BRL onramp
quote_request = QuoteRequest(
    from_payment="pix",
    input_amount="150000",  # 1500.00 BRL
    input_currency=FiatToken.BRL,
    output_currency=EvmToken.USDC,
    ramp_type="on",
    to_network=Networks.Polygon
)

quote = sdk.create_quote(quote_request)
print(f"Quote ID: {quote['id']}")
print(f"Output amount: {quote['outputAmount']}")

# Register the ramp
onramp_data = {
    "destinationAddress": "0x1234567890123456789012345678901234567890",
    "taxId": "123.456.789-00"
}

result = sdk.register_ramp(quote, onramp_data)
ramp_process = result["rampProcess"]

print(f"Ramp ID: {ramp_process['id']}")
print(f"Deposit QR Code: {ramp_process['depositQrCode']}")

# After making the PIX payment, start the ramp
started_ramp = sdk.start_ramp(ramp_process["id"])
print(f"Ramp status: {started_ramp['status']}")
```

## Features

- **Full SDK Functionality**: Access all Vortex SDK features from Python
- **Type Hints**: Full type annotations for better IDE support
- **Async Support**: Asyncio-compatible for modern Python applications
- **Zero Rewrite**: Uses the battle-tested TypeScript SDK via PythonMonkey
- **Cross-Platform**: Works on Linux, macOS, and Windows

## API Reference

### VortexSDK

#### Constructor

```python
sdk = VortexSDK(config: dict)
```

**Config Parameters:**
- `apiBaseUrl` (str, required): Vortex API base URL
- `pendulumWsUrl` (str, optional): Custom Pendulum WebSocket URL
- `moonbeamWsUrl` (str, optional): Custom Moonbeam WebSocket URL
- `hydrationWsUrl` (str, optional): Custom Hydration WebSocket URL
- `autoReconnect` (bool, optional): Auto-reconnect to WebSocket (default: True)
- `alchemyApiKey` (str, optional): Alchemy API key for EVM operations
- `storeEphemeralKeys` (bool, optional): Store ephemeral keys to file (default: True)

#### Methods

##### `create_quote(request: dict) -> dict`

Creates a new quote for a ramp operation.

**Parameters:**
- `request`: Dictionary with quote parameters
  - `from`: Payment method ("pix" or "sepa")
  - `inputAmount`: Amount in smallest unit (e.g., cents)
  - `inputCurrency`: Input currency (use FiatToken constants)
  - `outputCurrency`: Output currency (use EvmToken constants)
  - `rampType`: "on" or "off"
  - `to`: Destination network (use Networks constants)

**Returns:** Quote object with pricing and routing information

##### `get_quote(quote_id: str) -> dict`

Retrieves an existing quote by ID.

##### `get_ramp_status(ramp_id: str) -> dict`

Gets the current status of a ramp process.

##### `register_ramp(quote: dict, additional_data: dict) -> dict`

Registers a new ramp process.

**Additional Data (BRL Onramp):**
- `destinationAddress`: Target EVM address
- `taxId`: Brazilian CPF/CNPJ

**Additional Data (BRL Offramp):**
- `pixDestination`: PIX key for payment
- `receiverTaxId`: Receiver's CPF/CNPJ
- `taxId`: Sender's CPF/CNPJ
- `walletAddress`: Source wallet address

**Returns:** Dictionary with `rampProcess` and `unsignedTransactions`

##### `update_ramp(quote: dict, ramp_id: str, update_data: dict) -> dict`

Updates a ramp with additional transaction hashes (for offramps).

##### `start_ramp(ramp_id: str) -> dict`

Starts the ramp process after registration.

## Constants

### FiatToken
```python
from vortex_sdk import FiatToken

FiatToken.BRL  # Brazilian Real
FiatToken.EUR  # Euro
```

### EvmToken
```python
from vortex_sdk import EvmToken

EvmToken.USDC  # USD Coin
EvmToken.USDT  # Tether
# ... other supported tokens
```

### Networks
```python
from vortex_sdk import Networks

Networks.Polygon
Networks.Moonbeam
Networks.Ethereum
# ... other supported networks
```

## Examples

### BRL Onramp (PIX to USDC on Polygon)

```python
from vortex_sdk import VortexSDK, FiatToken, EvmToken, Networks

sdk = VortexSDK({"apiBaseUrl": "https://api.vortex.pendulumchain.tech"})

# Create quote
quote = sdk.create_quote({
    "from": "pix",
    "inputAmount": "100000",  # 1000.00 BRL
    "inputCurrency": FiatToken.BRL,
    "outputCurrency": EvmToken.USDC,
    "rampType": "on",
    "to": Networks.Polygon
})

# Register ramp
result = sdk.register_ramp(quote, {
    "destinationAddress": "0xYourAddress",
    "taxId": "123.456.789-00"
})

# Display payment info
print(f"Make PIX payment using: {result['rampProcess']['depositQrCode']}")

# After payment confirmation, start the ramp
started = sdk.start_ramp(result['rampProcess']['id'])
```

### BRL Offramp (USDC from Polygon to PIX)

```python
from vortex_sdk import VortexSDK, FiatToken, EvmToken, Networks

sdk = VortexSDK({"apiBaseUrl": "https://api.vortex.pendulumchain.tech"})

# Create quote
quote = sdk.create_quote({
    "from": Networks.Polygon,
    "inputAmount": "1000000",  # 1 USDC (6 decimals)
    "inputCurrency": EvmToken.USDC,
    "outputCurrency": FiatToken.BRL,
    "rampType": "off",
    "to": "pix"
})

# Register ramp
result = sdk.register_ramp(quote, {
    "pixDestination": "your-pix-key@example.com",
    "receiverTaxId": "987.654.321-00",
    "taxId": "123.456.789-00",
    "walletAddress": "0xYourAddress"
})

# Sign and submit the unsigned transactions
unsigned_txs = result["unsignedTransactions"]
# ... sign transactions with your wallet ...

# Update with transaction hashes
sdk.update_ramp(quote, result['rampProcess']['id'], {
    "squidRouterApproveHash": "0xApprovalTxHash",
    "squidRouterSwapHash": "0xSwapTxHash"
})

# Start the ramp
started = sdk.start_ramp(result['rampProcess']['id'])
```

### Checking Ramp Status

```python
from vortex_sdk import VortexSDK

sdk = VortexSDK({"apiBaseUrl": "https://api.vortex.pendulumchain.tech"})

ramp_id = "your-ramp-id"
status = sdk.get_ramp_status(ramp_id)

print(f"Current phase: {status['currentPhase']}")
print(f"Status: {status['status']}")
```

## Async/Await Support

The SDK supports asyncio for non-blocking operations:

```python
import asyncio
from vortex_sdk import VortexSDK

async def main():
    sdk = VortexSDK({"apiBaseUrl": "https://api.vortex.pendulumchain.tech"})
    
    quote = await sdk.create_quote_async({
        "from": "pix",
        "inputAmount": "100000",
        "inputCurrency": "BRL",
        "outputCurrency": "USDC",
        "rampType": "on",
        "to": "polygon"
    })
    
    print(f"Quote created: {quote['id']}")

asyncio.run(main())
```

## Development

### Running Tests

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest tests/

# Run with coverage
pytest --cov=vortex_sdk tests/
```

### Building

```bash
# Build distribution packages
python -m build

# Install locally
pip install -e .
```

## Environment Support

This SDK currently supports:
- **Python**: 3.9+
- **Node.js**: 18+ (runtime requirement for PythonMonkey)
- **Operating Systems**: Linux, macOS, Windows

## Troubleshooting

### PythonMonkey Installation Issues

If you encounter issues installing PythonMonkey:

```bash
# On Linux, you may need build dependencies
sudo apt-get install python3-dev

# On macOS with ARM (M1/M2)
arch -arm64 pip install pythonmonkey

# On Windows, ensure you have Visual C++ Build Tools
```

### Node.js Not Found

Ensure Node.js 18+ is installed and in your PATH:

```bash
node --version  # Should be v18.0.0 or higher
```

## License

MIT License - see LICENSE file for details

## Links

- [GitHub Repository](https://github.com/pendulum-chain/vortex)
- [Vortex Documentation](https://docs.vortex.pendulumchain.tech)
- [PythonMonkey](https://pythonmonkey.io/)

## Contributing

Contributions are welcome! Please see CONTRIBUTING.md for guidelines.
