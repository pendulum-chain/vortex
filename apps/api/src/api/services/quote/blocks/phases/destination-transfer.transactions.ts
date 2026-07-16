import {
  EvmNetworks,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  isEvmTokenDetails,
  isNativeEvmToken,
  multiplyByPowerOfTen,
  OnChainToken
} from "@vortexfi/shared";
import { addOnrampDestinationChainTransactions } from "../../../transactions/onramp/common/transactions";
import type { PrepareCtx, PreparedPhaseTxs } from "../core/types";

// The presigned final transfer the DestinationTransferExecutor broadcasts: quote.outputAmount
// from the destination-chain ephemeral to the user's address.
export async function prepareDestinationTransferTxs(ctx: PrepareCtx): Promise<PreparedPhaseTxs> {
  const { quote, evmEphemeral, destinationAddress } = ctx;

  const toNetwork = getNetworkFromDestination(quote.to);
  if (!toNetwork) {
    throw new Error(`prepareDestinationTransferTxs: Invalid network for destination ${quote.to}`);
  }

  const outputTokenDetails = getOnChainTokenDetails(toNetwork, quote.outputCurrency as OnChainToken);
  if (!outputTokenDetails || !isEvmTokenDetails(outputTokenDetails)) {
    throw new Error(`prepareDestinationTransferTxs: Output token ${quote.outputCurrency} is not an EVM token on ${toNetwork}`);
  }

  const finalAmountRaw = multiplyByPowerOfTen(quote.outputAmount, outputTokenDetails.decimals).toFixed(0, 0);
  const finalDestinationTransfer = await addOnrampDestinationChainTransactions({
    amountRaw: finalAmountRaw,
    destinationNetwork: toNetwork as EvmNetworks,
    isNativeToken: isNativeEvmToken(outputTokenDetails),
    toAddress: destinationAddress,
    toToken: outputTokenDetails.erc20AddressSourceChain
  });

  return {
    intents: [
      {
        lane: "main",
        network: toNetwork,
        phase: "destinationTransfer",
        signer: evmEphemeral.address,
        txData: finalDestinationTransfer
      }
    ]
  };
}
