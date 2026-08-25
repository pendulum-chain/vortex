import {
  EphemeralAccountType,
  EvmNetworks,
  getOnChainTokenDetails,
  isEvmTokenDetails,
  isNativeEvmToken,
  Networks,
  OnChainToken,
  RampDirection
} from "@vortexfi/shared";
import { requireAccount } from "../../core/accounts";
import { assertPreparedEvmDestinationFeeWithinQuote } from "../../core/evm-destination-gas";
import { createDestinationTransferTransaction } from "../../core/evm-transactions";
import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { DestinationTransferMetadata } from "./simulation";

// The presigned final transfer the DestinationTransferExecutor broadcasts: quote.outputAmount
// from the destination-chain ephemeral to the user's address.
export async function prepareDestinationTransferTxs(ctx: PrepareCtx<DestinationTransferMetadata>): Promise<PreparedPhaseTxs> {
  const evmEphemeral = requireAccount(ctx.accounts, EphemeralAccountType.EVM);
  const { destinationAddress, ownMetadata } = ctx;
  if (!destinationAddress) {
    throw new Error("prepareDestinationTransferTxs: Destination address is required");
  }

  const toNetwork = ownMetadata.network as Networks;

  const outputTokenDetails = getOnChainTokenDetails(toNetwork, ownMetadata.token as OnChainToken);
  if (!outputTokenDetails || !isEvmTokenDetails(outputTokenDetails)) {
    throw new Error(`prepareDestinationTransferTxs: Output token ${ownMetadata.token} is not an EVM token on ${toNetwork}`);
  }

  const finalDestinationTransfer = await createDestinationTransferTransaction({
    amountRaw: ownMetadata.amountRaw,
    destinationNetwork: toNetwork as EvmNetworks,
    gasLimit: ctx.globals.evmDestinationGas?.transferGasLimit,
    isNativeToken: isNativeEvmToken(outputTokenDetails),
    toAddress: destinationAddress,
    toToken: outputTokenDetails.erc20AddressSourceChain
  });
  // Quotes created before this metadata was introduced remain valid for their
  // short TTL. New BUY quotes always carry the fee envelope and are checked
  // again at registration in case destination fees moved meanwhile.
  if (ctx.quote.rampType === RampDirection.BUY && ctx.globals.evmDestinationGas) {
    assertPreparedEvmDestinationFeeWithinQuote(
      ctx.globals.evmDestinationGas,
      toNetwork as EvmNetworks,
      finalDestinationTransfer
    );
  }

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
