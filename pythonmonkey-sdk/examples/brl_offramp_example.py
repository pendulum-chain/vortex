"""
Example: BRL Offramp (USDC from Polygon to PIX)

This example demonstrates how to create an offramp from USDC on Polygon
to Brazilian Real (PIX).
"""

from vortex_sdk import VortexSDK, FiatToken, EvmToken, Networks

def main():
    # Initialize the SDK
    config = {
        "apiBaseUrl": "https://api.vortexfinance.co"
    }
    
    sdk = VortexSDK(config)
    
    # Step 1: Create a quote
    print("Creating quote for USDC to BRL...")
    quote_request = {
        "from": Networks.Polygon,
        "inputAmount": "1000000",  # 1.0 USDC (6 decimals)
        "inputCurrency": EvmToken.USDC,
        "outputCurrency": FiatToken.BRL,
        "rampType": "off",
        "to": "pix"
    }
    
    quote = sdk.create_quote(quote_request)
    print(f"✓ Quote created: {quote['id']}")
    print(f"  Input: {float(quote['inputAmount']) / 1e6:.6f} USDC")
    print(f"  Output: ~R$ {float(quote['outputAmount']) / 100:.2f}")
    print(f"  Rate: 1 USDC = R$ {float(quote['outputAmount']) / float(quote['inputAmount']) * 1e6 / 100:.2f}")
    
    # Step 2: Register the ramp
    print("\nRegistering ramp...")
    offramp_data = {
        "pixDestination": "your-pix-key@example.com",  # PIX key (email, phone, CPF, or random key)
        "receiverTaxId": "987.654.321-00",  # Receiver's CPF
        "taxId": "123.456.789-00",  # Your CPF
        "walletAddress": "0x1234567890123456789012345678901234567890"  # Your wallet address
    }
    
    result = sdk.register_ramp(quote, offramp_data)
    ramp_process = result["rampProcess"]
    unsigned_txs = result["unsignedTransactions"]
    
    print(f"✓ Ramp registered: {ramp_process['id']}")
    print(f"\nYou need to sign and submit {len(unsigned_txs)} transaction(s):")
    
    # Display transactions that need to be signed
    for i, tx in enumerate(unsigned_txs, 1):
        print(f"\nTransaction {i}:")
        print(f"  Type: {tx['type']}")
        print(f"  Chain: {tx['chain']}")
        print(f"  Signer: {tx['signer']}")
    
    print(f"\n{'='*60}")
    print("IMPORTANT: Sign and submit the transactions above")
    print("using your wallet before proceeding.")
    print('='*60)
    
    # In a real application, you would:
    # 1. Sign the transactions using a wallet (MetaMask, WalletConnect, etc.)
    # 2. Submit them to the blockchain
    # 3. Get the transaction hashes
    
    # For this example, we'll simulate getting the hashes
    print("\nAfter signing and submitting transactions, enter the hashes:")
    
    # Simulated input (in real app, these would come from wallet)
    approve_hash = input("Approval transaction hash: ")
    swap_hash = input("Swap transaction hash: ")
    
    # Step 3: Update ramp with transaction hashes
    if approve_hash and swap_hash:
        print("\nUpdating ramp with transaction hashes...")
        update_data = {
            "squidRouterApproveHash": approve_hash,
            "squidRouterSwapHash": swap_hash
        }
        
        updated_ramp = sdk.update_ramp(quote, ramp_process["id"], update_data)
        print(f"✓ Ramp updated with transaction hashes")
    
    # Step 4: Start the ramp
    print("\nStarting ramp process...")
    started_ramp = sdk.start_ramp(ramp_process["id"])
    
    print(f"✓ Ramp started!")
    print(f"  Status: {started_ramp['status']}")
    print(f"  Current Phase: {started_ramp['currentPhase']}")
    
    print(f"\n{'='*60}")
    print("The offramp is processing. The BRL will be sent to:")
    print(f"  PIX Key: {offramp_data['pixDestination']}")
    print(f"  Amount: R$ {float(quote['outputAmount']) / 100:.2f}")
    print('='*60)
    
    # Monitor status
    print("\nYou can check the ramp status at any time:")
    print(f"  ramp_id = '{ramp_process['id']}'")
    print(f"  status = sdk.get_ramp_status(ramp_id)")


if __name__ == "__main__":
    main()
