import { Networks } from "@vortexfi/shared";
import type { QuoteTicketAttributes } from "../../../../../../models/quoteTicket.model";
import { createEvmFeeDistributionTransaction } from "../../../../transactions/common/feeDistribution";
import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { DistributeFeesMetadata } from "./simulation";

// The presigned USDC fee transfer (or Multicall3 split) the DistributeFeesExecutor broadcasts.
// createEvmFeeDistributionTransaction returns null when there are no fees to distribute; the
// executor tolerates the missing presigned tx and skips.
export async function prepareDistributeFeesTxs(ctx: PrepareCtx<DistributeFeesMetadata>): Promise<PreparedPhaseTxs> {
  const quote = {
    ...ctx.quote,
    metadata: { fees: ctx.globals.fees, request: ctx.globals.request }
  } as QuoteTicketAttributes;
  const feeDistributionTx = await createEvmFeeDistributionTransaction(quote);

  if (!feeDistributionTx) {
    return { intents: [] };
  }

  return {
    intents: [
      {
        lane: "main",
        network: Networks.Base,
        phase: "distributeFees",
        signer: ctx.evmEphemeral.address,
        txData: feeDistributionTx
      }
    ]
  };
}
