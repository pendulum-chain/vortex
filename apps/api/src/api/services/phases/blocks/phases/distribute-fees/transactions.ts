import { EphemeralAccountType, EvmNetworks, EvmToken, evmTokenConfig, Networks } from "@vortexfi/shared";
import logger from "../../../../../../config/logger";
import type { QuoteTicketAttributes } from "../../../../../../models/quoteTicket.model";
import { requireAccount } from "../../core/accounts";
import { createEvmFeeDistributionTransactions } from "../../core/fee-distribution";
import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { DistributeFeesMetadata } from "./simulation";

// The presigned USDC fee transfers the DistributeFeesExecutor broadcasts: one plain
// ephemeral-signed ERC-20 transfer per fee recipient at consecutive nonces (network +
// vortex fees to the vortex payout address, partner markup to the pricing partner).
// Empty when the quote carries no positive fees; the executor tolerates the missing
// presigned txs and skips.
export async function prepareDistributeFeesTxs(ctx: PrepareCtx<DistributeFeesMetadata>): Promise<PreparedPhaseTxs> {
  const evmEphemeral = requireAccount(ctx.accounts, EphemeralAccountType.EVM);
  const quote = {
    ...ctx.quote,
    metadata: { fees: ctx.globals.fees, request: ctx.globals.request }
  } as QuoteTicketAttributes;
  const baseUsdcConfig = evmTokenConfig[Networks.Base][EvmToken.USDC];
  if (!baseUsdcConfig) {
    logger.warn("Base USDC configuration not found, skipping EVM fee distribution transactions");
    return { intents: [] };
  }
  const feeTransactions = await createEvmFeeDistributionTransactions(quote, Networks.Base as EvmNetworks, baseUsdcConfig);

  return {
    intents: feeTransactions.map(txData => ({
      lane: "main" as const,
      network: Networks.Base,
      phase: "distributeFees" as const,
      signer: evmEphemeral.address,
      txData
    }))
  };
}
