"""
Example: Using Async/Await with Vortex SDK

This example demonstrates how to use the async methods for non-blocking operations.
"""

import asyncio
from vortex_sdk import VortexSDK, FiatToken, EvmToken, Networks


async def create_and_monitor_ramp():
    """Create a ramp and monitor its status asynchronously."""
    
    # Initialize the SDK
    config = {
        "apiBaseUrl": "https://api.vortexfinance.co"
    }
    
    sdk = VortexSDK(config)
    
    # Step 1: Create quote asynchronously
    print("Creating quote...")
    quote_request = {
        "from": "pix",
        "inputAmount": "100000",
        "inputCurrency": FiatToken.BRL,
        "outputCurrency": EvmToken.USDC,
        "rampType": "on",
        "to": Networks.Polygon
    }
    
    quote = await sdk.create_quote_async(quote_request)
    print(f"✓ Quote created: {quote['id']}")
    
    # Step 2: Register ramp asynchronously
    print("Registering ramp...")
    onramp_data = {
        "destinationAddress": "0x1234567890123456789012345678901234567890",
        "taxId": "123.456.789-00"
    }
    
    result = await sdk.register_ramp_async(quote, onramp_data)
    ramp_id = result["rampProcess"]["id"]
    print(f"✓ Ramp registered: {ramp_id}")
    print(f"QR Code: {result['rampProcess']['depositQrCode']}")
    
    # Step 3: Monitor status in a loop
    print("\nMonitoring ramp status...")
    
    for i in range(5):
        await asyncio.sleep(2)  # Wait 2 seconds between checks
        status = await sdk.get_ramp_status_async(ramp_id)
        print(f"Check {i+1}: Phase={status['currentPhase']}, Status={status['status']}")
        
        if status['status'] == 'completed':
            print("✓ Ramp completed!")
            break


async def process_multiple_quotes():
    """Process multiple quotes concurrently."""
    
    config = {
        "apiBaseUrl": "https://api.vortex.pendulumchain.tech"
    }
    
    sdk = VortexSDK(config)
    
    # Create multiple quote requests
    requests = [
        {
            "from": "pix",
            "inputAmount": "50000",
            "inputCurrency": FiatToken.BRL,
            "outputCurrency": EvmToken.USDC,
            "rampType": "on",
            "to": Networks.Polygon
        },
        {
            "from": "pix",
            "inputAmount": "100000",
            "inputCurrency": FiatToken.BRL,
            "outputCurrency": EvmToken.USDC,
            "rampType": "on",
            "to": Networks.Polygon
        },
        {
            "from": "pix",
            "inputAmount": "200000",
            "inputCurrency": FiatToken.BRL,
            "outputCurrency": EvmToken.USDC,
            "rampType": "on",
            "to": Networks.Polygon
        }
    ]
    
    print("Creating multiple quotes concurrently...")
    
    # Create all quotes concurrently
    quotes = await asyncio.gather(*[
        sdk.create_quote_async(req) for req in requests
    ])
    
    print(f"✓ Created {len(quotes)} quotes:")
    for i, quote in enumerate(quotes, 1):
        input_brl = float(quote['inputAmount']) / 100
        output_usdc = float(quote['outputAmount']) / 1e6
        print(f"  {i}. {input_brl:.2f} BRL → {output_usdc:.6f} USDC")


async def main():
    """Main async function."""
    
    print("="*60)
    print("Example 1: Create and Monitor Ramp")
    print("="*60)
    await create_and_monitor_ramp()
    
    print("\n" + "="*60)
    print("Example 2: Process Multiple Quotes")
    print("="*60)
    await process_multiple_quotes()


if __name__ == "__main__":
    asyncio.run(main())
