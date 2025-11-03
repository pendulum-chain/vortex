# Quick Start

## Installation

```bash
cd pythonmonkey-sdk
npm install
pip install -e .
```

## First Onramp (BRL → USDC)

```python
from vortex_sdk import VortexSDK, FiatToken, EvmToken, Networks

sdk = VortexSDK({"apiBaseUrl": "https://api.vortex.pendulumchain.tech"})

quote = sdk.create_quote({
    "from": "pix",
    "inputAmount": "10000",
    "inputCurrency": FiatToken.BRL,
    "outputCurrency": EvmToken.USDC,
    "rampType": "on",
    "to": Networks.Polygon
})

result = sdk.register_ramp(quote, {
    "destinationAddress": "0xYourAddress",
    "taxId": "123.456.789-00"
})

print(f"Pay: {result['rampProcess']['depositQrCode']}")

# After payment
sdk.start_ramp(result['rampProcess']['id'])
```

See `examples/` for more.
