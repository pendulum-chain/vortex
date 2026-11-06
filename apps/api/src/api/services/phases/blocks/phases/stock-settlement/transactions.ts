import { EphemeralAccountType, Networks, PRESIGNED_EVM_FEE_MULTIPLIER } from "@vortexfi/shared";
import { requireAccount } from "../../core/accounts";
import { getEvmFundingAccount } from "../../core/evm-funding";
import { prepareBaseCleanupApproval } from "../../core/evm-transactions";
import { ROBINHOOD_STOCKS } from "../../core/robinhood-stocks";
import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { StockSettlementMetadata } from "./simulation";

/** Lets the funding account sweep what a fill above the promised amount leaves on the ephemeral. */
export async function prepareStockSettlementTxs(
  ctx: PrepareCtx<StockSettlementMetadata>,
  prepareApproval: typeof prepareBaseCleanupApproval = prepareBaseCleanupApproval
): Promise<PreparedPhaseTxs> {
  const signer = requireAccount(ctx.accounts, EphemeralAccountType.EVM).address;
  const txData = await prepareApproval(
    ROBINHOOD_STOCKS[ctx.ownMetadata.token].address,
    getEvmFundingAccount(Networks.Robinhood).address,
    Networks.Robinhood
  );
  return {
    intents: [
      {
        lane: "cleanup",
        network: Networks.Robinhood,
        phase: "robinhoodCleanupStock",
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
