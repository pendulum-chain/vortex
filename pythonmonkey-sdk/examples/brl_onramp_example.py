"""
Example: BRL Onramp (PIX to USDC on Polygon)

This example demonstrates how to create an onramp from Brazilian Real (PIX)
to USDC on the Polygon network.
"""

from vortex_sdk import VortexSDK, FiatToken, EvmToken, Networks

def main():
    # Initialize the SDK
    config = {
        "apiBaseUrl": "https://api.vortex.pendulumchain.tech"
    }
    
    sdk = VortexSDK(config)
    
    # Step 1: Create a quote
    print("Creating quote for BRL to USDC...")
    quote_request = {
        "from": "pix",
        "inputAmount": "100000",  # 1000.00 BRL (in cents)
        "inputCurrency": FiatToken.BRL,
        "outputCurrency": EvmToken.USDC,
        "rampType": "on",
        "to": Networks.Polygon
    }
    
    quote = sdk.create_quote(quote_request)
    print(f"✓ Quote created: {quote['id']}")
    print(f"  Input: {float(quote['inputAmount']) / 100:.2f} BRL")
    print(f"  Output: ~{float(quote['outputAmount']) / 1e6:.6f} USDC")
    print(f"  Rate: 1 BRL = {float(quote['outputAmount']) / float(quote['inputAmount']) * 100 / 1e6:.6f} USDC")
    
    # Step 2: Register the ramp
    print("\nRegistering ramp...")
    onramp_data = {
        "destinationAddress": "0x1234567890123456789012345678901234567890",  # Your wallet address
        "taxId": "123.456.789-00"  # Your CPF
    }
    
    result = sdk.register_ramp(quote, onramp_data)
    ramp_process = result["rampProcess"]
    
    print(f"✓ Ramp registered: {ramp_process['id']}")
    print(f"\n{'='*60}")
    print("PIX PAYMENT INSTRUCTIONS")
    print('='*60)
    print(f"Amount: R$ {float(quote['inputAmount']) / 100:.2f}")
    print(f"QR Code: {ramp_process['depositQrCode']}")
    print('\nPlease complete the PIX payment using the QR code above.')
    print('='*60)
    
    # Step 3: Wait for payment confirmation (in real application)
    input("\nPress Enter after completing the PIX payment...")
    
    # Step 4: Start the ramp
    print("\nStarting ramp process...")
    started_ramp = sdk.start_ramp(ramp_process["id"])
    
    print(f"✓ Ramp started!")
    print(f"  Status: {started_ramp['status']}")
    print(f"  Current Phase: {started_ramp['currentPhase']}")
    
    # Step 5: Monitor status (optional)
    print("\nYou can check the ramp status at any time:")
    print(f"  ramp_id = '{ramp_process['id']}'")
    print(f"  status = sdk.get_ramp_status(ramp_id)")
    
    # Check current status
    current_status = sdk.get_ramp_status(ramp_process["id"])
    print(f"\nCurrent status: {current_status['status']}")
    print(f"Current phase: {current_status['currentPhase']}")


if __name__ == "__main__":
    main()
