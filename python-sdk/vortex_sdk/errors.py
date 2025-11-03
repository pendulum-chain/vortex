"""
Error classes for the Vortex SDK.
"""


class VortexSdkError(Exception):
    """Base exception for all Vortex SDK errors."""
    
    def __init__(self, message: str, status: int = 500, is_public: bool = False, errors: list = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.is_public = is_public
        self.errors = errors or []


class RegisterRampError(VortexSdkError):
    """Error during ramp registration."""
    
    def __init__(self, message: str, status: int = 400):
        super().__init__(message, status, is_public=True)


class MissingRequiredFieldsError(RegisterRampError):
    """Missing required fields in the request."""
    
    def __init__(self, missing_fields: list):
        message = f"Missing required fields: {', '.join(missing_fields)}"
        super().__init__(message, 400)


class QuoteNotFoundError(RegisterRampError):
    """Quote not found."""
    
    def __init__(self):
        super().__init__("Quote not found", 404)


class QuoteExpiredError(RegisterRampError):
    """Quote has expired."""
    
    def __init__(self):
        super().__init__("Quote has expired", 400)


class InvalidNetworkError(RegisterRampError):
    """Invalid network specified."""
    
    def __init__(self, network: str):
        super().__init__(f'Invalid network: "{network}" provided', 400)


class InvalidAdditionalDataError(RegisterRampError):
    """Invalid additional data format."""
    
    def __init__(self, field: str):
        super().__init__(f"Invalid {field} format", 400)


# BRL Onramp specific errors
class BrlOnrampError(RegisterRampError):
    """BRL onramp specific error."""
    pass


class MissingBrlParametersError(BrlOnrampError):
    """Missing BRL onramp parameters."""
    
    def __init__(self):
        super().__init__("Parameters destinationAddress and taxId are required for onramp", 400)


class MoonbeamEphemeralNotFoundError(BrlOnrampError):
    """Moonbeam ephemeral account not found."""
    
    def __init__(self):
        super().__init__("Moonbeam ephemeral not found", 400)


class SubaccountNotFoundError(BrlOnrampError):
    """Subaccount not found - KYC not completed."""
    
    def __init__(self):
        super().__init__("Subaccount not found. Provided taxId has not been KYC'ed", 404)


class KycInvalidError(BrlOnrampError):
    """KYC is invalid."""
    
    def __init__(self):
        super().__init__("KYC invalid", 400)


class BrlKycStatusError(BrlOnrampError):
    """BRL KYC status error."""
    pass


class AmountExceedsLimitError(BrlOnrampError):
    """Amount exceeds KYC limits."""
    
    def __init__(self):
        super().__init__("Amount exceeds KYC limits", 400)


# BRL Offramp specific errors
class BrlOfframpError(RegisterRampError):
    """BRL offramp specific error."""
    pass


class MissingBrlOfframpParametersError(BrlOfframpError):
    """Missing BRL offramp parameters."""
    
    def __init__(self):
        super().__init__(
            "receiverTaxId, pixDestination and taxId parameters must be provided for offramp to BRL",
            400
        )


class InvalidPixKeyError(BrlOfframpError):
    """Invalid PIX key or receiver tax ID."""
    
    def __init__(self):
        super().__init__("Invalid pixKey or receiverTaxId", 400)


# Monerium specific errors
class MoneriumError(RegisterRampError):
    """Monerium specific error."""
    pass


class MissingMoneriumOnrampParametersError(MoneriumError):
    """Missing Monerium onramp parameters."""
    
    def __init__(self):
        super().__init__(
            "Parameters moneriumAuthToken and destinationAddress are required for Monerium onramp",
            400
        )


class MissingMoneriumOfframpParametersError(MoneriumError):
    """Missing Monerium offramp parameters."""
    
    def __init__(self):
        super().__init__(
            "Parameters walletAddress and moneriumAuthToken is required for Monerium onramp",
            400
        )


# Update Ramp Error Types
class UpdateRampError(VortexSdkError):
    """Error during ramp update."""
    
    def __init__(self, message: str, status: int = 400):
        super().__init__(message, status, is_public=True)


class RampNotFoundError(UpdateRampError):
    """Ramp not found."""
    
    def __init__(self):
        super().__init__("Ramp not found", 404)


class RampNotUpdatableError(UpdateRampError):
    """Ramp is not in a state that allows updates."""
    
    def __init__(self):
        super().__init__("Ramp is not in a state that allows updates", 409)


class InvalidPresignedTxsError(UpdateRampError):
    """Invalid presigned transactions."""
    
    def __init__(self, details: str = None):
        message = f"Invalid presigned transactions{': ' + details if details else ''}"
        super().__init__(message, 400)


# Start Ramp Error Types
class StartRampError(VortexSdkError):
    """Error during ramp start."""
    
    def __init__(self, message: str, status: int = 400):
        super().__init__(message, status, is_public=True)


class NoPresignedTransactionsError(StartRampError):
    """No presigned transactions found."""
    
    def __init__(self):
        super().__init__("No presigned transactions found. Please call updateRamp first.", 400)


class TimeWindowExceededError(StartRampError):
    """Maximum time window to start process exceeded."""
    
    def __init__(self):
        super().__init__("Maximum time window to start process exceeded. Ramp invalidated.", 400)


# Network errors
class NetworkError(VortexSdkError):
    """Network connection error."""
    
    def __init__(self, message: str):
        super().__init__(message, 500, is_public=False)


class APIConnectionError(NetworkError):
    """Failed to connect to API endpoint."""
    
    def __init__(self, endpoint: str, original_error: Exception = None):
        message = f"Failed to connect to API endpoint: {endpoint}"
        if original_error:
            message += f" ({str(original_error)})"
        super().__init__(message)


class APIResponseError(VortexSdkError):
    """API response error."""
    
    def __init__(self, endpoint: str, status: int, status_text: str):
        super().__init__(
            f"API request failed for {endpoint}: {status} {status_text}",
            status,
            is_public=False
        )


def parse_api_error(response_data: dict) -> VortexSdkError:
    """
    Parse API error response and return appropriate error class.
    
    Args:
        response_data: Error response from the API
        
    Returns:
        Appropriate VortexSdkError subclass
    """
    message = response_data.get("message") or response_data.get("error", "")
    status = response_data.get("status", 500)
    errors = response_data.get("errors")
    
    # Map error messages to specific error classes
    error_mapping = {
        "Quote not found": QuoteNotFoundError,
        "Quote has expired": QuoteExpiredError,
        "Parameters destinationAddress and taxId are required for onramp": MissingBrlParametersError,
        "Moonbeam ephemeral not found": MoonbeamEphemeralNotFoundError,
        "Subaccount not found": SubaccountNotFoundError,
        "KYC invalid": KycInvalidError,
        "Missing taxId query parameters": lambda: BrlKycStatusError("Tax ID is required", 400),
        "Amount exceeds KYC limits": AmountExceedsLimitError,
        "Amount exceeds limit": AmountExceedsLimitError,
        "receiverTaxId, pixDestination and taxId parameters must be provided for offramp to BRL": MissingBrlOfframpParametersError,
        "Invalid pixKey or receiverTaxId": InvalidPixKeyError,
        "Parameters moneriumAuthToken and destinationAddress are required for Monerium onramp": MissingMoneriumOnrampParametersError,
        "Parameters walletAddress and moneriumAuthToken is required for Monerium onramp": MissingMoneriumOfframpParametersError,
        "Ramp not found": RampNotFoundError,
        "Ramp is not in a state that allows updates": RampNotUpdatableError,
        "No presigned transactions found. Please call updateRamp first.": NoPresignedTransactionsError,
        "Maximum time window to start process exceeded. Ramp invalidated.": TimeWindowExceededError,
    }
    
    # Check for exact matches
    if message in error_mapping:
        error_class = error_mapping[message]
        return error_class() if callable(error_class) else error_class
    
    # Check for partial matches
    if "Missing required fields" in message:
        return MissingRequiredFieldsError([])
    
    if "Invalid network:" in message:
        import re
        match = re.search(r'"([^"]+)"', message)
        network = match.group(1) if match else "unknown"
        return InvalidNetworkError(network)
    
    # Default error
    return VortexSdkError(message or "Unknown API error", status, is_public=True, errors=errors)
