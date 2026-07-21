import {
  EvmNetworks,
  getOnChainTokenDetails,
  isEvmTokenDetails,
  isNativeEvmToken,
  Networks,
  OnChainToken
} from "@vortexfi/shared";
import { addOnrampDestinationChainTransactions } from "../../../../transactions/onramp/common/transactions";
import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { DestinationTransferMetadata } from "./simulation";

// The presigned final transfer the DestinationTransferExecutor broadcasts: quote.outputAmount
// from the destination-chain ephemeral to the user's address.
export async function prepareDestinationTransferTxs(ctx: PrepareCtx<DestinationTransferMetadata>): Promise<PreparedPhaseTxs> {
  const { evmEphemeral, destinationAddress, ownMetadata } = ctx;

  const toNetwork = ownMetadata.network as Networks;

  const outputTokenDetails = getOnChainTokenDetails(toNetwork, ownMetadata.token as OnChainToken);
  if (!outputTokenDetails || !isEvmTokenDetails(outputTokenDetails)) {
    throw new Error(`prepareDestinationTransferTxs: Output token ${ownMetadata.token} is not an EVM token on ${toNetwork}`);
  }

  const finalDestinationTransfer = await addOnrampDestinationChainTransactions({
    amountRaw: ownMetadata.amountRaw,
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
