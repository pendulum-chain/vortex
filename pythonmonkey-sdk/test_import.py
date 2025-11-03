#!/usr/bin/env python3
"""
Quick test script to verify SDK can be imported and initialized.
"""

import sys
import os

print("="*60)
print("Vortex SDK Python Wrapper - Import Test")
print("="*60)

# Test 1: Import the module
print("\n1. Testing module import...")
try:
    from vortex_sdk import VortexSDK, FiatToken, EvmToken, Networks
    print("   ✓ Module imported successfully")
except Exception as e:
    print(f"   ✗ Import failed: {e}")
    sys.exit(1)

# Test 2: Check constants
print("\n2. Testing constants...")
try:
    assert FiatToken.BRL == "BRL"
    assert EvmToken.USDC == "USDC"
    assert Networks.Polygon == "polygon"
    print("   ✓ Constants are correct")
except Exception as e:
    print(f"   ✗ Constants check failed: {e}")
    sys.exit(1)

# Test 3: Try to initialize SDK
print("\n3. Testing SDK initialization...")
try:
    config = {
        "apiBaseUrl": "https://api.vortex.pendulumchain.tech"
    }
    sdk = VortexSDK(config)
    print("   ✓ SDK initialized successfully")
    print(f"   SDK instance: {sdk}")
except Exception as e:
    print(f"   ✗ Initialization failed: {e}")
    print("\nTroubleshooting:")
    print("- Ensure packages/sdk/dist/index.js exists")
    print("- Run: cd packages/sdk && bun run build")
    print("- Set VORTEX_SDK_PATH if SDK is in a different location")
    sys.exit(1)

print("\n" + "="*60)
print("All tests passed! The SDK is ready to use.")
print("="*60)
print("\nNext steps:")
print("- Run examples: python examples/brl_onramp_example.py")
print("- Read README.md for full documentation")
