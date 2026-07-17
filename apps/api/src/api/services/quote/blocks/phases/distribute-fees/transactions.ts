import { Networks } from "@vortexfi/shared";
import { createEvmFeeDistributionTransaction } from "../../../../transactions/common/feeDistribution";
import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";

// The presigned USDC fee transfer (or Multicall3 split) the DistributeFeesExecutor broadcasts.
// createEvmFeeDistributionTransaction returns null when there are no fees to distribute; the
// executor tolerates the missing presigned tx and skips.
export async function prepareDistributeFeesTxs(ctx: PrepareCtx): Promise<PreparedPhaseTxs> {
  const feeDistributionTx = await createEvmFeeDistributionTransaction(ctx.quote);

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
