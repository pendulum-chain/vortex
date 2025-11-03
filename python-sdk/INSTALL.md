# Installation and Usage Guide

## Installation

### Using pip

```bash
cd python-sdk
pip install -r requirements.txt
```

### Using setup.py (for development)

```bash
cd python-sdk
pip install -e .
```

## Quick Start

### 1. Basic Setup

```python
from vortex_sdk import VortexSdk, RampDirection, FiatToken, EvmToken, Networks

# Initialize the SDK
sdk = VortexSdk(api_base_url="http://localhost:3000")
```

### 2. Create a Quote

```python
# For BRL Onramp (PIX to crypto)
quote_request = {
    "from": "pix",
    "to": Networks.POLYGON,
    "inputAmount": "100",
    "inputCurrency": FiatToken.BRL,
    "outputCurrency": EvmToken.USDC,
    "rampType": RampDirection.BUY,
    "network": Networks.POLYGON
}

quote = sdk.create_quote(quote_request)
print(f"Quote ID: {quote['id']}")
print(f"Output: {quote['outputAmount']} {quote['outputCurrency']}")
```

### 3. Register and Complete a Ramp

#### BRL Onramp Example

```python
# Register the onramp
onramp_data = {
    "destinationAddress": "0x1234567890123456789012345678901234567890",
    "taxId": "123.456.789-00"
}

result = sdk.register_ramp(quote, onramp_data)
ramp_process = result["rampProcess"]

# Get PIX payment details
print(f"Deposit QR Code: {ramp_process['depositQrCode']}")

# After making the PIX payment, start the ramp
started_ramp = sdk.start_ramp(ramp_process["id"])
```

#### BRL Offramp Example

```python
# Register the offramp
offramp_data = {
    "walletAddress": "0x1234567890123456789012345678901234567890",
    "taxId": "123.456.789-00",
    "receiverTaxId": "987.654.321-00",
    "pixDestination": "123.456.789-00"
}

result = sdk.register_ramp(quote, offramp_data)
ramp_process = result["rampProcess"]
unsigned_transactions = result["unsignedTransactions"]

# Display transactions user must sign
for tx in unsigned_transactions:
    print(f"Phase: {tx['phase']}, Data: {tx['txData']}")

# After signing and broadcasting transactions, update with hashes
update_data = {
    "squidRouterApproveHash": "0xabc...",
    "squidRouterSwapHash": "0xdef..."
}
updated_ramp = sdk.update_ramp(quote, ramp_process["id"], update_data)

# Start the offramp
started_ramp = sdk.start_ramp(ramp_process["id"])
```

## Running Examples

### BRL Onramp Example

```bash
cd python-sdk
python examples/example_brl_onramp.py
```

This example will:
1. Create a quote for converting BRL to USDC on Polygon
2. Register the onramp with a destination address and tax ID
3. Display the PIX QR code for payment
4. Wait for payment confirmation
5. Start the ramp process

### BRL Offramp Example

```bash
cd python-sdk
python examples/example_brl_offramp.py
```

This example will:
1. Create a quote for converting USDC to BRL
2. Register the offramp with wallet address and PIX details
3. Display unsigned transactions that need to be signed
4. Prompt for transaction hashes
5. Update the ramp with transaction hashes
6. Start the offramp process

## Python Version Requirements

- Python 3.8 or higher
- `requests` library (automatically installed with pip)

## API Configuration

You can configure the API base URL when initializing the SDK:

```python
# For local development
sdk = VortexSdk(api_base_url="http://localhost:3000")

# For production
sdk = VortexSdk(api_base_url="https://api.vortexfinance.co")
```

## Error Handling

The SDK provides comprehensive error handling:

```python
from vortex_sdk import VortexSdk
from vortex_sdk.errors import (
    QuoteNotFoundError,
    QuoteExpiredError,
    BrlKycStatusError,
    VortexSdkError
)

try:
    quote = sdk.create_quote(request)
except QuoteNotFoundError:
    print("Quote not found")
except QuoteExpiredError:
    print("Quote has expired, create a new one")
except BrlKycStatusError as e:
    print(f"KYC error: {e.message}")
except VortexSdkError as e:
    print(f"SDK error (status {e.status}): {e.message}")
```

## Project Structure

```
python-sdk/
├── vortex_sdk/
│   ├── __init__.py          # Package initialization and exports
│   ├── vortex_sdk.py        # Main SDK class
│   ├── api_service.py       # API communication layer
│   ├── brl_handler.py       # BRL-specific operations
│   ├── constants.py         # Enums and constants
│   └── errors.py            # Error classes
├── examples/
│   ├── __init__.py
│   ├── example_brl_onramp.py
│   └── example_brl_offramp.py
├── README.md                # Main documentation
├── INSTALL.md              # This file
├── requirements.txt        # Python dependencies
├── setup.py               # Package setup
└── .gitignore            # Git ignore rules
```

## Development

### Installing in Development Mode

```bash
cd python-sdk
pip install -e .
```

This allows you to make changes to the code and test them immediately without reinstalling.

### Running Tests

(Tests not yet implemented - coming soon)

```bash
pytest tests/
```

## Troubleshooting

### Import Errors

If you get import errors, make sure you're in the correct directory and have installed dependencies:

```bash
cd python-sdk
pip install -r requirements.txt
```

### API Connection Issues

Verify the API is running and accessible:

```bash
curl http://localhost:3000/v1/quotes
```

### KYC Errors

Ensure the tax ID provided has completed KYC level 1 or higher in the Vortex system.

## Support

For issues or questions:
- GitHub: https://github.com/pendulum-chain/vortex
- Documentation: https://api-docs.vortexfinance.co
