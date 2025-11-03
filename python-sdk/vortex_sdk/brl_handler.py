"""
Handler for Brazilian Real (BRL) ramp operations.
"""

from typing import Dict, Any
from .errors import BrlKycStatusError


class BrlHandler:
    """
    Handler for BRL onramp and offramp operations.
    
    This class abstracts the business logic for Brazilian Real ramps,
    including KYC validation and ramp registration/update.
    """
    
    def __init__(self, api_service):
        """
        Initialize the BRL handler.
        
        Args:
            api_service: ApiService instance for making API calls
        """
        self.api_service = api_service
    
    def register_brl_onramp(
        self, 
        quote_id: str, 
        additional_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Register a BRL onramp (PIX to crypto).
        
        Note: In the Python SDK, we simplify the flow by not handling
        ephemeral key generation and transaction signing, as these are
        complex blockchain operations that require specialized libraries.
        The backend will handle ephemeral accounts internally.
        
        Args:
            quote_id: Quote identifier
            additional_data: Dictionary containing:
                - destinationAddress: Destination wallet address
                - taxId: Brazilian tax ID (CPF)
        
        Returns:
            Ramp process response including depositQrCode for PIX payment
        
        Raises:
            ValueError: If required fields are missing
            BrlKycStatusError: If KYC validation fails
        """
        if not additional_data.get("taxId"):
            raise ValueError("Tax ID is required for BRL onramp")
        
        if not additional_data.get("destinationAddress"):
            raise ValueError("Destination address is required for BRL onramp")
        
        # Validate KYC status
        self._validate_brl_kyc(additional_data["taxId"])
        
        # Register the ramp without ephemeral accounts
        # (simplified for Python - backend handles complexity)
        register_request = {
            "quoteId": quote_id,
            "additionalData": {
                "destinationAddress": additional_data["destinationAddress"],
                "taxId": additional_data["taxId"]
            },
            "signingAccounts": []  # Simplified: backend generates ephemerals
        }
        
        ramp_process = self.api_service.register_ramp(register_request)
        
        # Auto-update with empty presigned transactions
        # (backend will handle transaction signing)
        update_request = {
            "rampId": ramp_process["id"],
            "additionalData": {},
            "presignedTxs": []
        }
        
        updated_ramp = self.api_service.update_ramp(update_request)
        
        return updated_ramp
    
    def register_brl_offramp(
        self, 
        quote_id: str, 
        additional_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Register a BRL offramp (crypto to PIX).
        
        Note: User must sign and broadcast the returned unsigned transactions
        before calling update_ramp and start_ramp.
        
        Args:
            quote_id: Quote identifier
            additional_data: Dictionary containing:
                - walletAddress: User's wallet address
                - taxId: User's Brazilian tax ID (CPF)
                - receiverTaxId: Receiver's tax ID
                - pixDestination: PIX key for receiving funds
        
        Returns:
            Ramp process response with unsigned transactions
        
        Raises:
            ValueError: If required fields are missing
            BrlKycStatusError: If KYC validation fails
        """
        required_fields = ["taxId", "walletAddress", "receiverTaxId", "pixDestination"]
        for field in required_fields:
            if not additional_data.get(field):
                raise ValueError(f"{field} is required for BRL offramp")
        
        # Validate KYC status
        self._validate_brl_kyc(additional_data["taxId"])
        
        # Register the ramp
        register_request = {
            "quoteId": quote_id,
            "additionalData": {
                "walletAddress": additional_data["walletAddress"],
                "taxId": additional_data["taxId"],
                "receiverTaxId": additional_data["receiverTaxId"],
                "pixDestination": additional_data["pixDestination"]
            },
            "signingAccounts": []  # Simplified: backend generates ephemerals
        }
        
        ramp_process = self.api_service.register_ramp(register_request)
        
        # Auto-update with empty presigned transactions
        # (backend will handle transaction signing for ephemeral accounts)
        update_request = {
            "rampId": ramp_process["id"],
            "additionalData": {},
            "presignedTxs": []
        }
        
        updated_ramp = self.api_service.update_ramp(update_request)
        
        return updated_ramp
    
    def update_brl_offramp(
        self, 
        ramp_id: str, 
        additional_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update a BRL offramp with user transaction hashes.
        
        This should be called after the user has signed and broadcast
        the squidRouter transactions on-chain.
        
        Args:
            ramp_id: Ramp identifier
            additional_data: Dictionary containing (all optional):
                - squidRouterApproveHash: Squid router approve tx hash
                - squidRouterSwapHash: Squid router swap tx hash
                - assethubToPendulumHash: AssetHub to Pendulum tx hash
        
        Returns:
            Updated ramp process
        
        Raises:
            ValueError: If ramp is not in the correct phase
        """
        # Verify ramp is in initial phase
        ramp_process = self.api_service.get_ramp_status(ramp_id)
        if ramp_process.get("currentPhase") != "initial":
            raise ValueError(
                f"Invalid ramp id. Ramp must be on initial phase to be updated. "
                f"Current phase: {ramp_process.get('currentPhase')}"
            )
        
        # Update with transaction hashes
        update_request = {
            "rampId": ramp_id,
            "additionalData": {
                "squidRouterApproveHash": additional_data.get("squidRouterApproveHash"),
                "squidRouterSwapHash": additional_data.get("squidRouterSwapHash"),
                "assethubToPendulumHash": additional_data.get("assethubToPendulumHash")
            },
            "presignedTxs": []  # Presigned txs sent during registration
        }
        
        updated_ramp = self.api_service.update_ramp(update_request)
        return updated_ramp
    
    def start_brl_ramp(self, ramp_id: str) -> Dict[str, Any]:
        """
        Start a BRL ramp process.
        
        For onramps: Call after making the PIX payment
        For offramps: Call after updating with transaction hashes
        
        Args:
            ramp_id: Ramp identifier
        
        Returns:
            Started ramp process
        """
        start_request = {"rampId": ramp_id}
        return self.api_service.start_ramp(start_request)
    
    def _validate_brl_kyc(self, tax_id: str) -> None:
        """
        Validate BRL KYC status for a tax ID.
        
        Args:
            tax_id: Brazilian tax ID (CPF)
        
        Raises:
            BrlKycStatusError: If tax ID is missing or KYC level is insufficient
        """
        if not tax_id:
            raise BrlKycStatusError("Tax ID is required", 400)
        
        kyc_status = self.api_service.get_brl_kyc_status(tax_id)
        kyc_level = kyc_status.get("kycLevel", 0)
        
        if kyc_level < 1:
            raise ValueError(f"Insufficient KYC level. Current: {kyc_level}")
