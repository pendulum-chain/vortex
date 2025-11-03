"""
Main Vortex SDK class.
"""

from typing import Dict, Any, List, Optional
from .api_service import ApiService
from .brl_handler import BrlHandler
from .constants import RampDirection


class VortexSdk:
    """
    Main SDK class for interacting with Vortex Finance API.
    
    This SDK provides a stateless interface for creating quotes and managing
    cross-chain ramp operations (onramp and offramp).
    """
    
    def __init__(self, api_base_url: str):
        """
        Initialize the Vortex SDK.
        
        Args:
            api_base_url: Base URL of the Vortex API (e.g., "http://localhost:3000")
        """
        self.api_service = ApiService(api_base_url)
        self.brl_handler = BrlHandler(self.api_service)
    
    def create_quote(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new quote for a ramp operation.
        
        Args:
            request: Quote request parameters containing:
                - from: Source (e.g., "pix" for onramp)
                - to: Destination network (e.g., Networks.POLYGON)
                - inputAmount: Amount to convert
                - inputCurrency: Input currency (e.g., FiatToken.BRL)
                - outputCurrency: Output currency (e.g., EvmToken.USDC)
                - rampType: RampDirection.BUY or RampDirection.SELL
                - network: Target network
        
        Returns:
            Quote response containing:
                - id: Quote ID
                - inputAmount: Input amount
                - outputAmount: Output amount
                - totalFeeFiat: Total fee in fiat
                - feeCurrency: Fee currency
                - expiresAt: Quote expiration timestamp
                - rampType: Ramp direction
                - from/to: Source and destination
        
        Example:
            >>> quote = sdk.create_quote({
            ...     "from": "pix",
            ...     "to": Networks.POLYGON,
            ...     "inputAmount": "100",
            ...     "inputCurrency": FiatToken.BRL,
            ...     "outputCurrency": EvmToken.USDC,
            ...     "rampType": RampDirection.BUY,
            ...     "network": Networks.POLYGON
            ... })
        """
        return self.api_service.create_quote(request)
    
    def get_quote(self, quote_id: str) -> Dict[str, Any]:
        """
        Retrieve an existing quote by ID.
        
        Args:
            quote_id: The quote identifier
        
        Returns:
            Quote response dictionary
        
        Example:
            >>> quote = sdk.get_quote("quote-123")
        """
        return self.api_service.get_quote(quote_id)
    
    def get_ramp_status(self, ramp_id: str) -> Dict[str, Any]:
        """
        Get the current status of a ramp process.
        
        Args:
            ramp_id: The ramp process identifier
        
        Returns:
            Ramp process status containing:
                - id: Ramp ID
                - currentPhase: Current processing phase
                - status: Overall status
                - unsignedTxs: List of unsigned transactions (if any)
        
        Example:
            >>> status = sdk.get_ramp_status("ramp-456")
        """
        return self.api_service.get_ramp_status(ramp_id)
    
    def get_user_transactions(
        self, 
        ramp_process: Dict[str, Any], 
        user_address: str
    ) -> List[Dict[str, Any]]:
        """
        Filter unsigned transactions for a specific user address.
        
        Args:
            ramp_process: Ramp process response
            user_address: User's wallet address
        
        Returns:
            List of unsigned transactions for the user
        """
        unsigned_txs = ramp_process.get("unsignedTxs", [])
        if not unsigned_txs:
            return []
        
        return [tx for tx in unsigned_txs if tx.get("signer") == user_address]
    
    def register_ramp(
        self, 
        quote: Dict[str, Any], 
        additional_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Register a new ramp process.
        
        For BRL onramps, additional_data should contain:
            - destinationAddress: Destination wallet address
            - taxId: Brazilian tax ID
        
        For BRL offramps, additional_data should contain:
            - walletAddress: User's wallet address
            - taxId: Brazilian tax ID
            - receiverTaxId: Receiver's tax ID
            - pixDestination: PIX key for receiving funds
        
        Args:
            quote: Quote response from create_quote()
            additional_data: Additional data required for the ramp type
        
        Returns:
            Dictionary containing:
                - rampProcess: The registered ramp process
                - unsignedTransactions: List of transactions user must sign (for offramps)
        
        Example (BRL Onramp):
            >>> result = sdk.register_ramp(quote, {
            ...     "destinationAddress": "0x1234...",
            ...     "taxId": "123.456.789-00"
            ... })
        
        Example (BRL Offramp):
            >>> result = sdk.register_ramp(quote, {
            ...     "walletAddress": "0x1234...",
            ...     "taxId": "123.456.789-00",
            ...     "receiverTaxId": "987.654.321-00",
            ...     "pixDestination": "123.456.789-00"
            ... })
        """
        ramp_type = quote.get("rampType")
        
        if ramp_type == RampDirection.BUY:
            # Onramp
            if quote.get("from") == "pix":
                ramp_process = self.brl_handler.register_brl_onramp(
                    quote["id"], 
                    additional_data
                )
                return {
                    "rampProcess": ramp_process,
                    "unsignedTransactions": []
                }
            elif quote.get("from") == "sepa":
                raise NotImplementedError("Euro onramp handler not implemented yet")
            else:
                raise ValueError(f"Unsupported onramp from: {quote.get('from')}")
        
        elif ramp_type == RampDirection.SELL:
            # Offramp
            if quote.get("to") == "pix":
                ramp_process = self.brl_handler.register_brl_offramp(
                    quote["id"], 
                    additional_data
                )
                user_address = additional_data.get("walletAddress")
                unsigned_transactions = self.get_user_transactions(ramp_process, user_address)
                return {
                    "rampProcess": ramp_process,
                    "unsignedTransactions": unsigned_transactions
                }
            elif quote.get("to") == "sepa":
                raise NotImplementedError("Euro offramp handler not implemented yet")
            else:
                raise ValueError(f"Unsupported offramp to: {quote.get('to')}")
        else:
            raise ValueError(f"Unsupported ramp type: {ramp_type}")
    
    def update_ramp(
        self, 
        quote: Dict[str, Any], 
        ramp_id: str, 
        additional_update_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update a ramp with transaction hashes (for offramps).
        
        For BRL offramps, additional_update_data can contain:
            - squidRouterApproveHash: Squid router approve transaction hash (optional)
            - squidRouterSwapHash: Squid router swap transaction hash (optional)
            - assethubToPendulumHash: AssetHub to Pendulum transaction hash (optional)
        
        Args:
            quote: Quote response
            ramp_id: The ramp identifier
            additional_update_data: Transaction hashes and other update data
        
        Returns:
            Updated ramp process
        
        Example:
            >>> updated_ramp = sdk.update_ramp(quote, ramp_id, {
            ...     "squidRouterApproveHash": "0xabc...",
            ...     "squidRouterSwapHash": "0xdef..."
            ... })
        """
        ramp_type = quote.get("rampType")
        
        if ramp_type == RampDirection.BUY:
            if quote.get("from") == "pix":
                raise ValueError("BRL onramp does not require any further data")
            elif quote.get("from") == "sepa":
                raise NotImplementedError("Euro onramp handler not implemented yet")
        
        elif ramp_type == RampDirection.SELL:
            if quote.get("to") == "pix":
                return self.brl_handler.update_brl_offramp(ramp_id, additional_update_data)
            elif quote.get("to") == "sepa":
                raise NotImplementedError("Euro offramp handler not implemented yet")
        
        raise ValueError(
            f"Unsupported ramp type: {ramp_type} with from: {quote.get('from')}, to: {quote.get('to')}"
        )
    
    def start_ramp(self, ramp_id: str) -> Dict[str, Any]:
        """
        Start a registered ramp process.
        
        This should be called after:
        - For onramps: After the fiat payment has been made
        - For offramps: After updating with transaction hashes
        
        Args:
            ramp_id: The ramp identifier
        
        Returns:
            Started ramp process
        
        Example:
            >>> started_ramp = sdk.start_ramp(ramp_id)
        """
        return self.brl_handler.start_brl_ramp(ramp_id)
