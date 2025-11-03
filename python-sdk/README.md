# Vortex Python SDK

A Python SDK that provides access to Vortex's API for cross-chain ramp operations.

## Features

- **Simple API**: Clean interface for creating quotes, registering ramps, and managing transactions
- **Type Hints**: Full type hint support for better IDE integration and code safety
- **Error Handling**: Comprehensive error classes for different scenarios
- **Stateless Design**: No internal state management - you control persistence

## Requirements

- Python 3.8 or higher
- `requests` library

## Installation

### From PyPI (Recommended)

Once published, install with pip:

```bash
pip install vortex-finance-sdk
```

### From Source

```bash
cd python-sdk
pip install -r requirements.txt
```

## Quick Start

```python
from vortex_sdk import VortexSdk, RampDirection, FiatToken, EvmToken, Networks

# Initialize the SDK
sdk = VortexSdk(api_base_url="http://localhost:3000")

# Create a quote for BRL onramp
quote_request = {
    "from": "pix",
    "inputAmount": "100",
    "inputCurrency": FiatToken.BRL,
    "outputCurrency": EvmToken.USDC,
    "rampType": RampDirection.BUY,
    "to": Networks.POLYGON,
    "network": Networks.POLYGON
}

quote = sdk.create_quote(quote_request)

# Register the ramp
brl_onramp_data = {
    "destinationAddress": "0x1234567890123456789012345678901234567890",
    "taxId": "123.456.789-00"
}

result = sdk.register_ramp(quote, brl_onramp_data)
ramp_process = result["rampProcess"]

# Make the PIX payment using the QR code
print(f"Please make PIX payment using: {ramp_process['depositQrCode']}")

# Start the ramp after payment
started_ramp = sdk.start_ramp(ramp_process["id"])
```

## API Reference

### VortexSdk

#### `__init__(api_base_url: str)`
Initialize the SDK with the Vortex API base URL.

#### `create_quote(request: dict) -> dict`
Creates a new quote for a ramp operation.

**Parameters:**
- `request`: Quote request parameters

**Returns:**
- Quote response dictionary

#### `get_quote(quote_id: str) -> dict`
Retrieves an existing quote by ID.

**Parameters:**
- `quote_id`: The quote identifier

**Returns:**
- Quote response dictionary

#### `get_ramp_status(ramp_id: str) -> dict`
Gets the current status of a ramp process.

**Parameters:**
- `ramp_id`: The ramp identifier

**Returns:**
- Ramp process dictionary

#### `register_ramp(quote: dict, additional_data: dict) -> dict`
Registers a new ramp process.

**Parameters:**
- `quote`: Quote response from `create_quote`
- `additional_data`: Additional data required for the ramp type

**Returns:**
- Dictionary containing `rampProcess` and `unsignedTransactions`

#### `update_ramp(quote: dict, ramp_id: str, additional_update_data: dict) -> dict`
Updates a ramp with transaction hashes (for offramps).

**Parameters:**
- `quote`: Quote response
- `ramp_id`: The ramp identifier
- `additional_update_data`: Transaction hashes and other update data

**Returns:**
- Updated ramp process dictionary

#### `start_ramp(ramp_id: str) -> dict`
Starts a registered ramp process.

**Parameters:**
- `ramp_id`: The ramp identifier

**Returns:**
- Started ramp process dictionary

## Constants

### RampDirection
- `BUY`: For onramp operations
- `SELL`: For offramp operations

### FiatToken
- `BRL`: Brazilian Real
- `EUR`: Euro

### EvmToken
- `USDC`: USD Coin
- `USDT`: Tether

### Networks
- `POLYGON`: Polygon network
- `ARBITRUM`: Arbitrum network
- `BASE`: Base network

## Error Handling

The SDK provides specific error classes for different scenarios:

```python
from vortex_sdk.errors import (
    VortexSdkError,
    QuoteNotFoundError,
    QuoteExpiredError,
    BrlKycStatusError,
    APIConnectionError
)

try:
    quote = sdk.create_quote(request)
except QuoteNotFoundError:
    print("Quote not found")
except QuoteExpiredError:
    print("Quote has expired")
except VortexSdkError as e:
    print(f"SDK error: {e}")
```

## Examples

See the `examples/` directory for complete examples:

- `example_brl_onramp.py`: Brazilian Real onramp example
- `example_brl_offramp.py`: Brazilian Real offramp example

## Running Examples

The examples automatically handle the module path, so you can run them directly:

### BRL Onramp Example
```bash
cd python-sdk
python examples/example_brl_onramp.py
```

### BRL Offramp Example
```bash
cd python-sdk
python examples/example_brl_offramp.py
```

## Development

### Installing for Development

```bash
cd python-sdk
pip install -e .
```

### Running Tests

```bash
python test_imports.py
```

## Publishing

To publish this package to PyPI, see:
- [QUICKSTART_PUBLISH.md](QUICKSTART_PUBLISH.md) - Quick publishing guide
- [PUBLISHING.md](PUBLISHING.md) - Detailed publishing documentation

## Project Structure

```
python-sdk/
├── vortex_sdk/              # Main SDK package
│   ├── __init__.py
│   ├── vortex_sdk.py
│   ├── api_service.py
│   ├── brl_handler.py
│   ├── constants.py
│   └── errors.py
├── examples/                # Usage examples
│   ├── example_brl_onramp.py
│   └── example_brl_offramp.py
├── README.md               # This file
├── INSTALL.md             # Installation guide
├── PUBLISHING.md          # Detailed publishing guide
├── QUICKSTART_PUBLISH.md  # Quick publishing guide
├── LICENSE                # MIT License
├── pyproject.toml        # Package configuration
├── requirements.txt      # Dependencies
└── setup.py             # Setup script
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- GitHub: https://github.com/pendulum-chain/vortex
- Documentation: https://api-docs.vortexfinance.co
