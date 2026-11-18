import { EphemeralAccountType, Networks, PRESIGNED_EVM_FEE_MULTIPLIER } from "@vortexfi/shared";
import { requireAccount } from "../../core/accounts";
import { getEvmFundingAccount } from "../../core/evm-funding";
import { prepareBaseCleanupApproval } from "../../core/evm-transactions";
import { BASE_PAXG_ADDRESS } from "../../core/gold-base";
import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { GoldSettlementMetadata } from "./simulation";

/** Lets the funding account sweep what a fill above the promised amount leaves on the ephemeral. */
export async function prepareGoldSettlementTxs(
  ctx: PrepareCtx<GoldSettlementMetadata>,
  prepareApproval: typeof prepareBaseCleanupApproval = prepareBaseCleanupApproval
): Promise<PreparedPhaseTxs> {
  const signer = requireAccount(ctx.accounts, EphemeralAccountType.EVM).address;
  const txData = await prepareApproval(BASE_PAXG_ADDRESS, getEvmFundingAccount(Networks.Base).address, Networks.Base);
  return {
    intents: [
      {
        lane: "cleanup",
        network: Networks.Base,
        phase: "baseCleanupPaxg",
        prefundNativeValueRaw: (
          BigInt(txData.gas) *
          BigInt(txData.maxFeePerGas as string) *
          PRESIGNED_EVM_FEE_MULTIPLIER
        ).toString(),
        signer,
        txData
      }
    ]
  };
}
