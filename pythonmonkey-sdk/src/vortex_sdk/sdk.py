"""
Main VortexSDK class - Python wrapper using Node.js subprocess
"""

import asyncio
from typing import Dict, Any, List

from .bridge import NodeBridge
from .exceptions import VortexSDKError, APIError


class VortexSDK:
    """
    Python wrapper for the Vortex SDK using Node.js subprocess.
    
    This class provides a Pythonic interface to the TypeScript/JavaScript
    Vortex SDK, enabling cross-chain ramp operations.
    """

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the Vortex SDK.

        Args:
            config: Configuration dictionary with the following keys:
                - apiBaseUrl (str, required): Vortex API base URL
                - pendulumWsUrl (str, optional): Custom Pendulum WebSocket URL
                - moonbeamWsUrl (str, optional): Custom Moonbeam WebSocket URL
                - hydrationWsUrl (str, optional): Custom Hydration WebSocket URL
                - autoReconnect (bool, optional): Auto-reconnect to WebSocket
                - alchemyApiKey (str, optional): Alchemy API key
                - storeEphemeralKeys (bool, optional): Store ephemeral keys

        Raises:
            VortexSDKError: If initialization fails
        """
        self._bridge = NodeBridge(config)

    def create_quote(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new quote for a ramp operation.

        Args:
            request: Quote request with keys:
                - from: Payment method or network
                - inputAmount: Amount in smallest unit
                - inputCurrency: Input currency code
                - outputCurrency: Output currency code
                - rampType: "on" or "off"
                - to: Destination network or payment method

        Returns:
            Quote object with pricing and routing information

        Raises:
            APIError: If the API request fails
        """
        return self._bridge.call_method("createQuote", request)

    def get_quote(self, quote_id: str) -> Dict[str, Any]:
        """
        Retrieve an existing quote by ID.

        Args:
            quote_id: The quote identifier

        Returns:
            Quote object

        Raises:
            APIError: If the API request fails
        """
        return self._bridge.call_method("getQuote", quote_id)

    def get_ramp_status(self, ramp_id: str) -> Dict[str, Any]:
        """
        Get the current status of a ramp process.

        Args:
            ramp_id: The ramp process identifier

        Returns:
            Ramp process object with current status

        Raises:
            APIError: If the API request fails
        """
        return self._bridge.call_method("getRampStatus", ramp_id)

    def register_ramp(
        self, 
        quote: Dict[str, Any], 
        additional_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Register a new ramp process.

        Args:
            quote: Quote object from create_quote
            additional_data: Ramp-specific data:
                For BRL Onramp:
                    - destinationAddress: Target EVM address
                    - taxId: Brazilian CPF/CNPJ
                For BRL Offramp:
                    - pixDestination: PIX key
                    - receiverTaxId: Receiver's CPF/CNPJ
                    - taxId: Sender's CPF/CNPJ
                    - walletAddress: Source wallet address

        Returns:
            Dictionary with:
                - rampProcess: The registered ramp process
                - unsignedTransactions: List of transactions to sign

        Raises:
            APIError: If the API request fails
        """
        # registerRamp needs more time for blockchain operations (signing, network init)
        return self._bridge.call_method("registerRamp", quote, additional_data, timeout=180)

    def update_ramp(
        self,
        quote: Dict[str, Any],
        ramp_id: str,
        update_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update a ramp with additional transaction hashes.

        Args:
            quote: Quote object
            ramp_id: The ramp process identifier
            update_data: Update data with transaction hashes:
                - squidRouterApproveHash: Approval transaction hash
                - squidRouterSwapHash: Swap transaction hash
                - assethubToPendulumHash: XCM transaction hash

        Returns:
            Updated ramp process object

        Raises:
            APIError: If the API request fails
        """
        return self._bridge.call_method("updateRamp", quote, ramp_id, update_data)

    def start_ramp(self, ramp_id: str) -> Dict[str, Any]:
        """
        Start the ramp process.

        Args:
            ramp_id: The ramp process identifier

        Returns:
            Updated ramp process object

        Raises:
            APIError: If the API request fails
        """
        # startRamp may need time for blockchain operations
        return self._bridge.call_method("startRamp", ramp_id, timeout=120)

    def get_user_transactions(
        self,
        ramp_process: Dict[str, Any],
        user_address: str
    ) -> List[Dict[str, Any]]:
        """
        Get unsigned transactions for a specific user address.

        Args:
            ramp_process: The ramp process object
            user_address: User's wallet address

        Returns:
            List of unsigned transactions for the user

        Raises:
            VortexSDKError: If operation fails
        """
        return self._bridge.call_method("getUserTransactions", ramp_process, user_address)

    # Async versions of the methods
    async def create_quote_async(
        self, 
        request: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Async version of create_quote."""
        return await asyncio.to_thread(self.create_quote, request)

    async def get_quote_async(self, quote_id: str) -> Dict[str, Any]:
        """Async version of get_quote."""
        return await asyncio.to_thread(self.get_quote, quote_id)

    async def get_ramp_status_async(self, ramp_id: str) -> Dict[str, Any]:
        """Async version of get_ramp_status."""
        return await asyncio.to_thread(self.get_ramp_status, ramp_id)

    async def register_ramp_async(
        self,
        quote: Dict[str, Any],
        additional_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Async version of register_ramp."""
        return await asyncio.to_thread(
            self.register_ramp, quote, additional_data
        )

    async def update_ramp_async(
        self,
        quote: Dict[str, Any],
        ramp_id: str,
        update_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Async version of update_ramp."""
        return await asyncio.to_thread(
            self.update_ramp, quote, ramp_id, update_data
        )

    async def start_ramp_async(self, ramp_id: str) -> Dict[str, Any]:
        """Async version of start_ramp."""
        return await asyncio.to_thread(self.start_ramp, ramp_id)

    async def get_user_transactions_async(
        self,
        ramp_process: Dict[str, Any],
        user_address: str
    ) -> List[Dict[str, Any]]:
        """Async version of get_user_transactions."""
        return await asyncio.to_thread(
            self.get_user_transactions, ramp_process, user_address
        )

    def __repr__(self) -> str:
        return f"<VortexSDK>"
