"""
Example: Brazilian Real (BRL) Offramp

This example demonstrates how to create a BRL offramp (crypto to PIX) using the Vortex SDK.
"""

import sys
import os

# Add parent directory to path to import vortex_sdk
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from vortex_sdk import VortexSdk, RampDirection, FiatToken, EvmToken, Networks


def run_brl_offramp_example():
    """Run the BRL offramp example."""
    try:
        print("Starting BRL Offramp Example...\n")
        
        # Step 1: Initialize VortexSdk
        print("📝 Step 1: Initializing VortexSdk...")
        sdk = VortexSdk(api_base_url="http://localhost:3000")
        print("✅ VortexSdk initialized successfully\n")
        
        # Step 2: Create quote for BRL offramp
        print("📝 Step 2: Creating quote for BRL offramp...")
        quote_request = {
            "from": Networks.POLYGON,
            "inputAmount": "100",
            "inputCurrency": EvmToken.USDC,
            "network": Networks.POLYGON,
            "outputCurrency": FiatToken.BRL,
            "rampType": RampDirection.SELL,
            "to": "pix"
        }
        
        quote = sdk.create_quote(quote_request)
        print("✅ Quote created successfully:")
        print(f"   Quote ID: {quote['id']}")
        print(f"   Input: {quote['inputAmount']} {quote['inputCurrency']}")
        print(f"   Output: {quote['outputAmount']} {quote['outputCurrency']}")
        print(f"   Total Fee: {quote['totalFeeFiat']} {quote['feeCurrency']}")
        print(f"   Expires at: {quote['expiresAt']}\n")
        
        # Step 3: Register the BRL offramp
        print("📝 Step 3: Registering BRL offramp...")
        brl_offramp_data = {
            "pixDestination": "157.492.981-08",
            "receiverTaxId": "157.492.981-08",
            "taxId": "157.492.981-08",
            "walletAddress": "0x1234567890123456789012345678901234567890"
        }
        
        result = sdk.register_ramp(quote, brl_offramp_data)
        ramp_process = result["rampProcess"]
        unsigned_transactions = result["unsignedTransactions"]
        
        print("✅ BRL Offramp registered successfully:")
        print(f"   Ramp ID: {ramp_process['id']}")
        
        # Display unsigned transactions the user must sign
        if unsigned_transactions:
            print("   Unsigned transactions:")
            for tx in unsigned_transactions:
                tx_data = tx.get("txData", {})
                print(f"     - {tx.get('phase')}: Send to {tx_data.get('to')} "
                      f"data {tx_data.get('data')} with value {tx_data.get('value')}")
        print()
        
        # Step 4: User must complete token payment on-chain
        print("🛑 IMPORTANT: Complete the token payment on-chain NOW.")
        print("   Execute the transactions shown above (squidRouterApprove and squidRouterSwap),")
        print("   and save the corresponding transaction hashes.\n")
        
        squid_router_approve_hash = input("➡️  Enter the Squid Router Approve Hash: ").strip()
        squid_router_swap_hash = input("➡️  Enter the Squid Router Swap Hash: ").strip()
        
        # Step 5: Update BRL offramp with transaction hashes
        print("\n📝 Step 4: Updating BRL offramp...")
        transaction_hashes = {
            "squidRouterApproveHash": squid_router_approve_hash,
            "squidRouterSwapHash": squid_router_swap_hash
        }
        
        updated_ramp = sdk.update_ramp(quote, ramp_process["id"], transaction_hashes)
        print("✅ BRL Offramp updated successfully.")
        
        # Step 6: Start the offramp
        print("\n📝 Step 5: Starting BRL offramp...")
        started_ramp = sdk.start_ramp(ramp_process["id"])
        print("✅ Offramp started successfully!")
        print(f"   Current Phase: {started_ramp.get('currentPhase')}")
        
    except Exception as error:
        print(f"❌ Error in BRL Offramp Example: {error}")
        if hasattr(error, '__dict__'):
            print(f"Error details: {error.__dict__}")
        sys.exit(1)


if __name__ == "__main__":
    run_brl_offramp_example()
    print("\n✨ Example execution completed")
    sys.exit(0)
