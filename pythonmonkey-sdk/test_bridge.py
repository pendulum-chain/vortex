#!/usr/bin/env python3
"""
Simple test script to verify the Node.js bridge works
"""

import sys
import os
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from vortex_sdk import VortexSDK, FiatToken, EvmToken, Networks

def test_basic_connection():
    """Test basic SDK connection without network calls"""
    print("=" * 60)
    print("Testing Vortex SDK Python Wrapper - Node.js Bridge")
    print("=" * 60)
    
    # Create SDK instance with minimal config to avoid network init
    config = {
        "apiBaseUrl": "https://api.vortex.pendulumchain.org",
        # Disable auto-reconnect to avoid WebSocket blocking
        "autoReconnect": False,
    }
    
    print("\n1. Creating SDK instance...")
    try:
        sdk = VortexSDK(config)
        print("   ✓ SDK instance created successfully")
    except Exception as e:
        print(f"   ✗ Failed to create SDK: {e}")
        return False
    
    # Test a simple API call (quote creation)
    print("\n2. Testing quote creation...")
    try:
        quote_request = {
            "from": "pix",
            "inputAmount": "100000",  # 1000 BRL
            "inputCurrency": FiatToken.BRL,
            "outputCurrency": EvmToken.USDC,
            "rampType": "on",
            "to": Networks.Polygon,
        }
        
        print(f"   Request: {quote_request}")
        quote = sdk.create_quote(quote_request)
        print(f"   ✓ Quote created successfully")
        print(f"   Quote ID: {quote.get('id', 'N/A')}")
        print(f"   Output Amount: {quote.get('outputAmount', 'N/A')}")
        return True
        
    except Exception as e:
        print(f"   ✗ Failed to create quote: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_basic_connection()
    sys.exit(0 if success else 1)
