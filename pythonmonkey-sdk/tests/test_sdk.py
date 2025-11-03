"""
Basic tests for Vortex SDK Python wrapper
"""

import pytest
from unittest.mock import Mock, patch
from vortex_sdk import VortexSDK, FiatToken, EvmToken, Networks
from vortex_sdk.exceptions import VortexSDKError, APIError


class TestVortexSDK:
    """Test suite for VortexSDK class."""
    
    @pytest.fixture
    def mock_sdk_path(self, tmp_path):
        """Create a mock SDK file."""
        sdk_file = tmp_path / "index.js"
        sdk_file.write_text("module.exports = { VortexSdk: function() {} };")
        return str(sdk_file)
    
    @pytest.fixture
    def config(self):
        """Basic SDK configuration."""
        return {
            "apiBaseUrl": "https://api.test.vortex.tech"
        }
    
    def test_initialization(self, config, monkeypatch):
        """Test SDK initialization."""
        with patch('vortex_sdk.sdk.pm') as mock_pm:
            # Mock the VortexSdk class
            mock_sdk_instance = Mock()
            mock_pm.eval.return_value = Mock(return_value=mock_sdk_instance)
            
            sdk = VortexSDK(config)
            assert sdk is not None
    
    def test_create_quote(self, config, monkeypatch):
        """Test quote creation."""
        with patch('vortex_sdk.sdk.pm') as mock_pm:
            mock_sdk_instance = Mock()
            mock_quote = {
                "id": "test-quote-123",
                "inputAmount": "100000",
                "outputAmount": "1000000",
                "rampType": "on"
            }
            mock_sdk_instance.createQuote = Mock(return_value=mock_quote)
            mock_pm.eval.return_value = Mock(return_value=mock_sdk_instance)
            
            sdk = VortexSDK(config)
            sdk._sdk = mock_sdk_instance
            
            quote_request = {
                "from": "pix",
                "inputAmount": "100000",
                "inputCurrency": FiatToken.BRL,
                "outputCurrency": EvmToken.USDC,
                "rampType": "on",
                "to": Networks.Polygon
            }
            
            result = sdk.create_quote(quote_request)
            assert result["id"] == "test-quote-123"
            mock_sdk_instance.createQuote.assert_called_once_with(quote_request)
    
    def test_get_quote(self, config, monkeypatch):
        """Test getting an existing quote."""
        with patch('vortex_sdk.sdk.pm') as mock_pm:
            mock_sdk_instance = Mock()
            mock_quote = {"id": "test-quote-123"}
            mock_sdk_instance.getQuote = Mock(return_value=mock_quote)
            mock_pm.eval.return_value = Mock(return_value=mock_sdk_instance)
            
            sdk = VortexSDK(config)
            sdk._sdk = mock_sdk_instance
            
            result = sdk.get_quote("test-quote-123")
            assert result["id"] == "test-quote-123"
    
    def test_register_ramp(self, config, monkeypatch):
        """Test ramp registration."""
        with patch('vortex_sdk.sdk.pm') as mock_pm:
            mock_sdk_instance = Mock()
            mock_result = {
                "rampProcess": {
                    "id": "ramp-123",
                    "status": "pending"
                },
                "unsignedTransactions": []
            }
            mock_sdk_instance.registerRamp = Mock(return_value=mock_result)
            mock_pm.eval.return_value = Mock(return_value=mock_sdk_instance)
            
            sdk = VortexSDK(config)
            sdk._sdk = mock_sdk_instance
            
            quote = {"id": "quote-123", "rampType": "on", "from": "pix"}
            additional_data = {
                "destinationAddress": "0x123",
                "taxId": "123.456.789-00"
            }
            
            result = sdk.register_ramp(quote, additional_data)
            assert result["rampProcess"]["id"] == "ramp-123"
    
    def test_get_ramp_status(self, config, monkeypatch):
        """Test getting ramp status."""
        with patch('vortex_sdk.sdk.pm') as mock_pm:
            mock_sdk_instance = Mock()
            mock_status = {
                "id": "ramp-123",
                "status": "processing",
                "currentPhase": "swap"
            }
            mock_sdk_instance.getRampStatus = Mock(return_value=mock_status)
            mock_pm.eval.return_value = Mock(return_value=mock_sdk_instance)
            
            sdk = VortexSDK(config)
            sdk._sdk = mock_sdk_instance
            
            result = sdk.get_ramp_status("ramp-123")
            assert result["status"] == "processing"
    
    def test_start_ramp(self, config, monkeypatch):
        """Test starting a ramp."""
        with patch('vortex_sdk.sdk.pm') as mock_pm:
            mock_sdk_instance = Mock()
            mock_ramp = {
                "id": "ramp-123",
                "status": "started"
            }
            mock_sdk_instance.startRamp = Mock(return_value=mock_ramp)
            mock_pm.eval.return_value = Mock(return_value=mock_sdk_instance)
            
            sdk = VortexSDK(config)
            sdk._sdk = mock_sdk_instance
            
            result = sdk.start_ramp("ramp-123")
            assert result["status"] == "started"
    
    @pytest.mark.asyncio
    async def test_async_create_quote(self, config, monkeypatch):
        """Test async quote creation."""
        with patch('vortex_sdk.sdk.pm') as mock_pm:
            mock_sdk_instance = Mock()
            mock_quote = {"id": "test-quote-123"}
            mock_sdk_instance.createQuote = Mock(return_value=mock_quote)
            mock_pm.eval.return_value = Mock(return_value=mock_sdk_instance)
            
            sdk = VortexSDK(config)
            sdk._sdk = mock_sdk_instance
            
            quote_request = {
                "from": "pix",
                "inputAmount": "100000",
                "inputCurrency": FiatToken.BRL,
                "outputCurrency": EvmToken.USDC,
                "rampType": "on",
                "to": Networks.Polygon
            }
            
            result = await sdk.create_quote_async(quote_request)
            assert result["id"] == "test-quote-123"


class TestConstants:
    """Test type constants."""
    
    def test_fiat_tokens(self):
        """Test FiatToken constants."""
        assert FiatToken.BRL == "BRL"
        assert FiatToken.EUR == "EUR"
        assert FiatToken.USD == "USD"
    
    def test_evm_tokens(self):
        """Test EvmToken constants."""
        assert EvmToken.USDC == "USDC"
        assert EvmToken.USDT == "USDT"
    
    def test_networks(self):
        """Test Networks constants."""
        assert Networks.Polygon == "polygon"
        assert Networks.Ethereum == "ethereum"
        assert Networks.Moonbeam == "moonbeam"


class TestExceptions:
    """Test custom exceptions."""
    
    def test_vortex_sdk_error(self):
        """Test VortexSDKError."""
        error = VortexSDKError("Test error")
        assert str(error) == "Test error"
    
    def test_api_error(self):
        """Test APIError with status code."""
        error = APIError("API failed", status_code=404)
        assert str(error) == "API failed"
        assert error.status_code == 404
