"""
Main VortexSDK class - Python wrapper using PythonMonkey
"""

import asyncio
import os
from typing import Dict, Any, Optional, List
from pathlib import Path

try:
    import pythonmonkey as pm
except ImportError:
    raise ImportError(
        "PythonMonkey is required but not installed. "
        "Install it with: pip install pythonmonkey"
    )

from .exceptions import VortexSDKError, TransactionSigningError, APIError


class VortexSDK:
    """
    Python wrapper for the Vortex SDK using PythonMonkey.
    
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
        try:
            # Determine the path to the compiled SDK
            sdk_path = self._find_sdk_path()
            
            #  Use PythonMonkey's require() which handles CommonJS
            # The npm package needs to be built as CommonJS for PythonMonkey compatibility
            if hasattr(pm, 'require'):
                try:
                    module = pm.require(sdk_path)
                except Exception as e:
                    raise VortexSDKError(
                        f"Failed to load Vortex SDK from {sdk_path}.\n"
                        f"Error: {str(e)}\n\n"
                        "The npm-published @vortexfi/sdk uses ES6 modules which are not "
                        "compatible with PythonMonkey.\n"
                        "Please build the SDK locally:\n"
                        "  cd ../packages/sdk\n"
                        "  bun install && bun run build\n"
                        "  cd ../../pythonmonkey-sdk\n\n"
                        "Or set VORTEX_SDK_PATH to point to a CommonJS build."
                    ) from e
            else:
                raise VortexSDKError(
                    "PythonMonkey require() not available. "
                    "Please update pythonmonkey: pip install --upgrade pythonmonkey"
                )
            
            # The SDK exports VortexSdk as a named export
            if not hasattr(module, 'VortexSdk'):
                raise VortexSDKError(
                    f"VortexSdk class not found in module. "
                    f"Available exports: {dir(module)}"
                )
            
            VortexSdkClass = module.VortexSdk
            
            # Create an instance of the SDK
            self._sdk = VortexSdkClass(config)
            
        except VortexSDKError:
            raise
        except Exception as e:
            raise VortexSDKError(f"Failed to initialize Vortex SDK: {str(e)}") from e

    def _find_sdk_path(self) -> str:
        """
        Find the path to the compiled Vortex SDK.
        
        Returns:
            str: Path to the SDK's index.js file
            
        Raises:
            VortexSDKError: If SDK cannot be found
        """
        # Priority 1: Try npm-installed package CommonJS in pythonmonkey-sdk/node_modules
        try:
            current_dir = Path(__file__).parent
            project_root = current_dir.parent.parent
            # Use the CommonJS version from the dual build
            node_modules_path = project_root / "node_modules" / "@vortexfi" / "sdk" / "dist" / "cjs" / "index.js"
            
            if node_modules_path.exists():
                return str(node_modules_path.absolute())
        except:
            pass
        
        # Priority 2: Try require.resolve for globally installed or project npm package
        try:
            npm_path = pm.eval(
                "require.resolve('@vortexfi/sdk')"
            )
            if npm_path:
                return npm_path
        except:
            pass
        
        # Priority 3: Try environment variable override
        sdk_path = os.environ.get("VORTEX_SDK_PATH")
        if sdk_path and Path(sdk_path).exists():
            return sdk_path
        
        # Priority 4: Try local repo build CommonJS (for development)
        try:
            repo_root = Path(__file__).parent.parent.parent.parent
            sdk_dist = repo_root / "packages" / "sdk" / "dist" / "cjs" / "index.js"
            
            if sdk_dist.exists():
                return str(sdk_dist.absolute())
        except:
            pass
        
        raise VortexSDKError(
            "Could not find Vortex SDK. Please install it:\n"
            "1. Run: npm install (in pythonmonkey-sdk/), or\n"
            "2. Run: npm install -g @vortexfi/sdk, or\n"
            "3. Set VORTEX_SDK_PATH environment variable\n\n"
            "The SDK should be version 0.4.0+ with dual build (ESM + CommonJS).\n"
            "See INSTALL.md for detailed instructions."
        )

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
        try:
            promise = self._sdk.createQuote(request)
            return self._await_promise(promise)
        except Exception as e:
            raise APIError(f"Failed to create quote: {str(e)}") from e

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
        try:
            promise = self._sdk.getQuote(quote_id)
            return self._await_promise(promise)
        except Exception as e:
            raise APIError(f"Failed to get quote: {str(e)}") from e

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
        try:
            promise = self._sdk.getRampStatus(ramp_id)
            return self._await_promise(promise)
        except Exception as e:
            raise APIError(f"Failed to get ramp status: {str(e)}") from e

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
        try:
            promise = self._sdk.registerRamp(quote, additional_data)
            return self._await_promise(promise)
        except Exception as e:
            raise APIError(f"Failed to register ramp: {str(e)}") from e

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
        try:
            promise = self._sdk.updateRamp(quote, ramp_id, update_data)
            return self._await_promise(promise)
        except Exception as e:
            raise APIError(f"Failed to update ramp: {str(e)}") from e

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
        try:
            promise = self._sdk.startRamp(ramp_id)
            return self._await_promise(promise)
        except Exception as e:
            raise APIError(f"Failed to start ramp: {str(e)}") from e

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
        try:
            promise = self._sdk.getUserTransactions(ramp_process, user_address)
            return self._await_promise(promise)
        except Exception as e:
            raise VortexSDKError(
                f"Failed to get user transactions: {str(e)}"
            ) from e

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

    def _await_promise(self, promise) -> Any:
        """
        Convert a JavaScript Promise to a Python value.
        
        Args:
            promise: JavaScript Promise object
            
        Returns:
            Resolved value from the promise
            
        Raises:
            Exception: If the promise is rejected
        """
        try:
            # PythonMonkey requires explicit promise handling
            # Use the wait function to block until promise resolves
            if hasattr(pm, 'wait'):
                return pm.wait(promise)
            else:
                # For versions without wait, use eval with await
                pm.eval("globalThis.__tempPromise = null;")
                pm.eval("globalThis.__tempPromise").assign(promise)
                result = pm.eval("""
                    (async () => {
                        return await globalThis.__tempPromise;
                    })()
                """)
                return pm.wait(result) if hasattr(pm, 'wait') else result
        except Exception as e:
            raise Exception(f"Promise rejected: {str(e)}") from e

    def __repr__(self) -> str:
        return f"<VortexSDK>"
