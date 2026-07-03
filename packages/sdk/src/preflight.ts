import {
  EvmClientManager,
  getOnChainTokenDetails,
  isEvmTokenDetails,
  isNetworkEVM,
  multiplyByPowerOfTen,
  QuoteResponse
} from "@vortexfi/shared";
import { erc20Abi } from "viem";
import { InsufficientBalanceError } from "./errors";

/**
 * Pre-flight guard for offramps: verify the user's source wallet holds the quoted input amount
 * before the ramp is registered. Every offramp corridor moves `inputAmount` of `inputCurrency`
 * out of that wallet on-chain (squidRouter approve/swap, a direct no-permit transfer, or an
 * EIP-2612 permit the backend executes), so registering without funds only produces user
 * transactions that revert — or hands the backend a single-use permit it cannot execute.
 *
 * Best-effort by design: an unknown token or an RPC failure skips the check instead of blocking
 * registration, because the backend re-validates balances authoritatively before moving funds.
 * Native gas is not checked here — the permit path needs none, and gas costs for the no-permit
 * path are unknown at registration time.
 */
export async function assertSufficientOfframpBalance(quote: QuoteResponse, walletAddress: string | undefined): Promise<void> {
  if (!walletAddress) {
    // A missing walletAddress is reported by the corridor handler's own parameter validation.
    return;
  }

  const network = quote.network;
  if (!isNetworkEVM(network)) {
    // AssetHub offramps are funded by a user extrinsic submitted outside the SDK; no pre-check.
    return;
  }

  let requiredRaw: bigint;
  let balance: bigint;
  try {
    const tokenDetails = getOnChainTokenDetails(network, quote.inputCurrency);
    if (!tokenDetails || !isEvmTokenDetails(tokenDetails)) {
      return;
    }

    requiredRaw = BigInt(multiplyByPowerOfTen(quote.inputAmount, tokenDetails.decimals).toFixed(0, 0));

    const evmClientManager = EvmClientManager.getInstance();
    balance = tokenDetails.isNative
      ? await evmClientManager.getBalanceWithRetry(network, walletAddress as `0x${string}`)
      : await evmClientManager.readContractWithRetry<bigint>(network, {
          abi: erc20Abi,
          address: tokenDetails.erc20AddressSourceChain,
          args: [walletAddress as `0x${string}`],
          functionName: "balanceOf"
        });
  } catch {
    return;
  }

  if (balance < requiredRaw) {
    throw new InsufficientBalanceError(quote.inputAmount, quote.inputCurrency, network, walletAddress);
  }
}
