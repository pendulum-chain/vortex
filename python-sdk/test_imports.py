"""
Simple test to verify all imports work correctly.
Run this to ensure the SDK is properly set up.
"""

def test_imports():
    """Test that all SDK components can be imported."""
    try:
        # Test main imports
        from vortex_sdk import (
            VortexSdk,
            RampDirection,
            FiatToken,
            EvmToken,
            Networks,
            VortexSdkError,
            QuoteNotFoundError,
        )
        
        print("✅ Main imports successful")
        
        # Test SDK instantiation
        sdk = VortexSdk(api_base_url="http://localhost:3000")
        print("✅ SDK instantiation successful")
        
        # Test constants
        assert RampDirection.BUY == "buy"
        assert RampDirection.SELL == "sell"
        assert FiatToken.BRL == "BRL"
        assert EvmToken.USDC == "USDC"
        assert Networks.POLYGON == "Polygon"
        print("✅ Constants loaded correctly")
        
        # Test error classes
        try:
            raise QuoteNotFoundError()
        except VortexSdkError as e:
            assert e.status == 404
            print("✅ Error classes work correctly")
        
        print("\n🎉 All imports and basic functionality verified!")
        print("The SDK is ready to use.")
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("\nMake sure you've installed dependencies:")
        print("  pip install -r requirements.txt")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False
    
    return True


if __name__ == "__main__":
    import sys
    success = test_imports()
    sys.exit(0 if success else 1)
