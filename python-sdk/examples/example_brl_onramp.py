"""
Example: Brazilian Real (BRL) Onramp

This example demonstrates how to create a BRL onramp (PIX to crypto) using the Vortex SDK.
"""

import sys
import os

# Add parent directory to path to import vortex_sdk
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from vortex_sdk import VortexSdk, RampDirection, FiatToken, EvmToken, Networks


def run_brl_onramp_example():
    """Run the BRL onramp example."""
    try:
        print("Starting BRL Onramp Example...\n")
        
        # Step 1: Initialize VortexSdk
        print("📝 Step 1: Initializing VortexSdk...")
        sdk = VortexSdk(api_base_url="https://api-staging.vortexfinance.co")
        print("✅ VortexSdk initialized successfully\n")
        
        # Step 2: Create quote for BRL onramp
        print("📝 Step 2: Creating quote for BRL onramp...")
        quote_request = {
            "from": "pix",
            "inputAmount": "100",
            "inputCurrency": FiatToken.BRL,
            "network": Networks.POLYGON,
            "outputCurrency": EvmToken.USDC,
            "rampType": RampDirection.BUY,
            "to": Networks.POLYGON,
            # "partnerId": "example-partner"  # Optional
        }
        
        quote = sdk.create_quote(quote_request)
        print("✅ Quote created successfully:")
        print(f"   Quote ID: {quote['id']}")
        print(f"   Input: {quote['inputAmount']} {quote['inputCurrency']}")
        print(f"   Output: {quote['outputAmount']} {quote['outputCurrency']}")
        print(f"   Total Fee: {quote['totalFeeFiat']} {quote['feeCurrency']}")
        print(f"   Expires at: {quote['expiresAt']}\n")
        
        # Step 3: Register the BRL onramp
        print("📝 Step 3: Registering BRL onramp...")
        brl_onramp_data = {
            "destinationAddress": "0x1234567890123456789012345678901234567890",
            "taxId": "123.456.789-00"
        }
        
        result = sdk.register_ramp(quote, brl_onramp_data)
        ramp_process = result["rampProcess"]
        
        print("✅ BRL Onramp registered successfully:")
        print(f"   Ramp ID: {ramp_process['id']}")
        
        if ramp_process.get("depositQrCode"):
            print(f"   Deposit QR Code: {ramp_process['depositQrCode']}")
        print()
        
        # Step 4: Make PIX payment
        print("🛑 IMPORTANT: Make the PIX payment NOW using the QR code above.")
        print("   The payment must be completed before starting the ramp.\n")
        
        # Wait for user confirmation (in real app, you'd verify payment another way)
        input("Press Enter after you have completed the PIX payment...")
        
        # Step 5: Start the BRL onramp process AFTER PAYMENT
        print("\n📝 Step 4: Starting BRL onramp...")
        started_ramp = sdk.start_ramp(ramp_process["id"])
        print("✅ BRL Onramp started successfully!")
        print(f"   Current Phase: {started_ramp.get('currentPhase')}")
        
    except Exception as error:
        print(f"❌ Error in BRL Onramp Example: {error}")
        if hasattr(error, '__dict__'):
            print(f"Error details: {error.__dict__}")
        sys.exit(1)


if __name__ == "__main__":
    run_brl_onramp_example()
    print("\n✨ Example execution completed")
    sys.exit(0)
