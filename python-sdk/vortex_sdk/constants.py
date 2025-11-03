"""
Constants and enums used throughout the Vortex SDK.
"""

from enum import Enum


class RampDirection(str, Enum):
    """Ramp direction types."""
    BUY = "BUY"
    SELL = "SELL"


class FiatToken(str, Enum):
    """Supported fiat tokens."""
    BRL = "BRL"
    EUR = "EUR"


class EvmToken(str, Enum):
    """Supported EVM tokens."""
    USDC = "USDC"
    USDT = "USDT"


class Networks(str, Enum):
    """Supported blockchain networks."""
    POLYGON = "polygon"
    ARBITRUM = "arbitrum"
    BASE = "base"
    MOONBEAM = "moonbeam"
    ASSETHUB = "assetHub"


class EphemeralAccountType(str, Enum):
    """Types of ephemeral accounts."""
    STELLAR = "Stellar"
    SUBSTRATE = "Substrate"
    EVM = "EVM"


class PaymentMethod(str, Enum):
    """Supported payment methods."""
    PIX = "pix"
    SEPA = "sepa"
