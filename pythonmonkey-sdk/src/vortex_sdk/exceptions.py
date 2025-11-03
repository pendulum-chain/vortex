"""
Exception classes for Vortex SDK
"""


class VortexSDKError(Exception):
    """Base exception for all Vortex SDK errors."""
    
    def __init__(self, message: str, original_error: Exception = None):
        super().__init__(message)
        self.original_error = original_error


class APIError(VortexSDKError):
    """Exception raised when API requests fail."""
    
    def __init__(self, message: str, status_code: int = None, original_error: Exception = None):
        super().__init__(message, original_error)
        self.status_code = status_code


class TransactionSigningError(VortexSDKError):
    """Exception raised when transaction signing fails."""
    pass


class ConfigurationError(VortexSDKError):
    """Exception raised for configuration-related errors."""
    pass


class NetworkError(VortexSDKError):
    """Exception raised for network-related errors."""
    pass


class ValidationError(VortexSDKError):
    """Exception raised for validation errors."""
    pass
