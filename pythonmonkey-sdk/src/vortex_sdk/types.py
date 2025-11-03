"""
Type definitions and constants for Vortex SDK
"""

from enum import Enum
from typing import TypedDict, Literal, Optional


class FiatToken:
    """Fiat currency tokens supported by Vortex."""
    BRL = "BRL"
    EUR = "EUR"
    USD = "USD"


class EvmToken:
    """EVM tokens supported by Vortex."""
    USDC = "USDC"
    USDT = "USDT"
    DAI = "DAI"
    WETH = "WETH"
    WBTC = "WBTC"


class Networks:
    """Blockchain networks supported by Vortex."""
    Ethereum = "ethereum"
    Polygon = "polygon"
    Moonbeam = "moonbeam"
    Pendulum = "pendulum"
    AssetHub = "assethub"
    Hydration = "hydration"


class RampDirection:
    """Ramp direction constants."""
    BUY = "on"  # Onramp (fiat to crypto)
    SELL = "off"  # Offramp (crypto to fiat)


class PaymentMethod:
    """Payment method constants."""
    PIX = "pix"
    SEPA = "sepa"


class RampPhase:
    """Ramp process phases."""
    INITIAL = "initial"
    FUND_EPHEMERAL = "fund_ephemeral"
    ONRAMP_MINT = "onramp_mint"
    SWAP = "swap"
    XCM_TRANSFER = "xcm_transfer"
    OFFRAMP_BURN = "offramp_burn"
    COMPLETED = "completed"
    FAILED = "failed"


class QuoteRequest(TypedDict, total=False):
    """
    Quote request structure.
    
    For onramps (fiat -> crypto):
        from: Payment method ("pix" or "sepa")
        to: Destination network
        
    For offramps (crypto -> fiat):
        from: Source network
        to: Payment method ("pix" or "sepa")
    """
    from_payment: str  # "pix" or "sepa" for onramps, or network for offramps
    to: str  # Network for onramps, or "pix"/"sepa" for offramps
    inputAmount: str
    inputCurrency: str
    outputCurrency: str
    rampType: Literal["on", "off"]


class BrlOnrampAdditionalData(TypedDict):
    """Additional data required for BRL onramp registration."""
    destinationAddress: str  # Target EVM address
    taxId: str  # Brazilian CPF/CNPJ


class BrlOfframpAdditionalData(TypedDict):
    """Additional data required for BRL offramp registration."""
    pixDestination: str  # PIX key for payment
    receiverTaxId: str  # Receiver's CPF/CNPJ
    taxId: str  # Sender's CPF/CNPJ
    walletAddress: str  # Source wallet address


class BrlOfframpUpdateData(TypedDict, total=False):
    """Update data for BRL offramp."""
    squidRouterApproveHash: Optional[str]
    squidRouterSwapHash: Optional[str]
    assethubToPendulumHash: Optional[str]


class EurOnrampAdditionalData(TypedDict):
    """Additional data required for EUR onramp registration."""
    moneriumAuthToken: str


class EurOfframpAdditionalData(TypedDict):
    """Additional data required for EUR offramp registration."""
    walletAddress: str
    paymentData: dict  # Payment details for SEPA transfer


class VortexSdkConfig(TypedDict, total=False):
    """Configuration for VortexSDK."""
    apiBaseUrl: str  # Required
    pendulumWsUrl: Optional[str]
    moonbeamWsUrl: Optional[str]
    hydrationWsUrl: Optional[str]
    autoReconnect: Optional[bool]
    alchemyApiKey: Optional[str]
    storeEphemeralKeys: Optional[bool]


class RampStatus:
    """Ramp process status constants."""
    PENDING = "pending"
    PROCESSING = "processing"
    WAITING_FOR_PAYMENT = "waiting_for_payment"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# Type aliases for better code readability
QuoteId = str
RampId = str
WalletAddress = str
TransactionHash = str
