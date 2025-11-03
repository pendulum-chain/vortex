# Quick Start Guide

Get up and running with the Vortex SDK Python wrapper in minutes.

## Installation

```bash
# 1. Install the Vortex SDK from npm
cd pythonmonkey-sdk
npm install

# 2. Install the Python wrapper
pip install -e .
```

**Note**: The SDK v0.4.0+ includes both ESM and CommonJS. PythonMonkey uses the CommonJS version automatically.

## Your First Onramp

Create a simple BRL to USDC onramp:

```python
from vortex_sdk import VortexSDK, FiatToken, EvmToken, Networks

# Initialize
sdk = VortexSDK({
    "apiBaseUrl": "https://api.vortex.pendulumchain.tech"
})

# Create quote: 100 BRL → USDC on Polygon
quote = sdk.create_quote({
    "from": "pix",
    "inputAmount": "10000",  # 100.00 BRL
    "inputCurrency": FiatToken.BRL,
    "outputCurrency": EvmToken.USDC,
    "rampType": "on",
    "to": Networks.Polygon
})

print(f"You'll receive ~{float(quote['outputAmount'])/1e6:.2f} USDC")

# Register ramp
result = sdk.register_ramp(quote, {
    "destinationAddress": "0xYourAddress",
    "taxId": "123.456.789-00"
})

# Get payment QR code
print(f"Pay with PIX: {result['rampProcess']['depositQrCode']}")

# After payment, start the ramp
sdk.start_ramp(result['rampProcess']['id'])
```

## Your First Offramp

Convert USDC back to BRL:

```python
from vortex_sdk import VortexSDK, FiatToken, EvmToken, Networks

sdk = VortexSDK({
    "apiBaseUrl": "https://api.vortex.pendulumchain.tech"
})

# Create quote: 1 USDC → BRL
quote = sdk.create_quote({
    "from": Networks.Polygon,
    "inputAmount": "1000000",  # 1.0 USDC
    "inputCurrency": EvmToken.USDC,
    "outputCurrency": FiatToken.BRL,
    "rampType": "off",
    "to": "pix"
})

# Register ramp
result = sdk.register_ramp(quote, {
    "pixDestination": "your-pix-key@email.com",
    "receiverTaxId": "987.654.321-00",
    "taxId": "123.456.789-00",
    "walletAddress": "0xYourAddress"
})

# Sign the transactions (using your wallet)
# Then update with transaction hashes
sdk.update_ramp(quote, result['rampProcess']['id'], {
    "squidRouterApproveHash": "0xApprovalHash",
    "squidRouterSwapHash": "0xSwapHash"
})

# Start the offramp
sdk.start_ramp(result['rampProcess']['id'])
```

## Async/Await

Use async for non-blocking operations:

```python
import asyncio
from vortex_sdk import VortexSDK

async def main():
    sdk = VortexSDK({"apiBaseUrl": "https://api.vortex.pendulumchain.tech"})
    
    quote = await sdk.create_quote_async({
        "from": "pix",
        "inputAmount": "10000",
        "inputCurrency": "BRL",
        "outputCurrency": "USDC",
        "rampType": "on",
        "to": "polygon"
    })
    
    print(f"Quote: {quote['id']}")

asyncio.run(main())
```

## Monitoring Status

Check ramp progress:

```python
status = sdk.get_ramp_status("your-ramp-id")
print(f"Phase: {status['currentPhase']}")
print(f"Status: {status['status']}")
```

## Common Patterns

### Amount Conversion

```python
# BRL to cents (input)
brl_amount = 100.00
input_amount = str(int(brl_amount * 100))  # "10000"

# USDC to smallest unit (6 decimals)
usdc_amount = 1.0
input_amount = str(int(usdc_amount * 1e6))  # "1000000"

# Parse output
output_brl = float(quote['outputAmount']) / 100
output_usdc = float(quote['outputAmount']) / 1e6
```

### Error Handling

```python
from vortex_sdk import VortexSDK
from vortex_sdk.exceptions import APIError, VortexSDKError

try:
    quote = sdk.create_quote(request)
except APIError as e:
    print(f"API error: {e}")
    if e.status_code:
        print(f"Status code: {e.status_code}")
except VortexSDKError as e:
    print(f"SDK error: {e}")
```

## Next Steps

- Read the full [README.md](README.md) for detailed API documentation
- Check [examples/](examples/) for complete code samples
- See [INSTALL.md](INSTALL.md) for troubleshooting

## Need Help?

- [GitHub Issues](https://github.com/pendulum-chain/vortex/issues)
- [Documentation](https://docs.vortex.pendulumchain.tech)
