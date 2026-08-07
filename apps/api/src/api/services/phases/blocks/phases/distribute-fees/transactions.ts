import { EphemeralAccountType, type EvmNetworks, type EvmToken, evmTokenConfig } from "@vortexfi/shared";
import Big from "big.js";
import type { QuoteTicketAttributes } from "../../../../../../models/quoteTicket.model";
import { requireAccount } from "../../core/accounts";
import { createEvmFeeDistributionTransactions } from "../../core/fee-distribution";
import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { DistributeFeesMetadata } from "./simulation";

// The presigned fee transfers the DistributeFeesExecutor broadcasts: one plain
// ephemeral-signed ERC-20 transfer per fee recipient at consecutive nonces (network +
// vortex fees to the vortex payout address, partner markup to the pricing partner).
// Empty when the quote carries no positive fees; the executor tolerates the missing
// presigned txs and skips.
export async function prepareDistributeFeesTxs(
  ctx: PrepareCtx<DistributeFeesMetadata>,
  network: EvmNetworks,
  feeToken: EvmToken
): Promise<PreparedPhaseTxs> {
  const evmEphemeral = requireAccount(ctx.accounts, EphemeralAccountType.EVM);
  const quote = {
    ...ctx.quote,
    metadata: { fees: ctx.globals.fees, request: ctx.globals.request }
  } as QuoteTicketAttributes;
  const tokenConfig = evmTokenConfig[network]?.[feeToken];
  if (!tokenConfig) {
    // Fail closed for fee-charging quotes: the fee was already deducted from the user
    // leg during pricing, so registering without collection transfers would strand
    // the residual on the ephemeral. Only a zero-fee quote may proceed without them.
    if (new Big(ctx.ownMetadata.totalFeesUsd).gt(0)) {
      throw new Error(
        `${network} ${feeToken} configuration not found; refusing to register a fee-charging quote whose fees could never be collected.`
      );
    }
    return { intents: [] };
  }
  const feeTransactions = await createEvmFeeDistributionTransactions(quote, network, tokenConfig);

  return {
    intents: feeTransactions.map(txData => ({
      lane: "main" as const,
      network,
      phase: "distributeFees" as const,
      signer: evmEphemeral.address,
      txData
    }))
  };
}
