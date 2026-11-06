import { Networks } from "@vortexfi/shared";
import Big from "big.js";
import { config } from "../../../../../../config/vars";
import { MAX_FINAL_SETTLEMENT_SUBSIDY_USD } from "../../../../../../constants/constants";
import { defineContext } from "../../core/metadata";
import type { StockSymbol } from "../../core/robinhood-stocks";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";

export interface StockSettlementMetadata {
  amountRaw: string;
  maxSubsidyUsd: string;
  network: typeof Networks.Robinhood;
  token: StockSymbol;
}

export const StockSettlementContext = defineContext<StockSettlementMetadata>()("stockSettlement");

/** Pass-through. Records the exact amount promised and how much Vortex may spend to deliver it. */
export async function simulateStockSettlement<Token extends StockSymbol>(
  token: Token,
  input: PhaseIO<Token, typeof Networks.Robinhood>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<Token, typeof Networks.Robinhood>, StockSettlementMetadata>> {
  if (input.chain !== Networks.Robinhood || input.token !== token || !input.requestInputAmountUsd) {
    throw new Error(`StockSettlement requires ${token} on ${Networks.Robinhood} with its USD value`);
  }
  const { settlementSubsidyMaxBps, settlementSubsidyMaxUsd } = config.stocks;
  const share = input.requestInputAmountUsd.mul(settlementSubsidyMaxBps).div(10_000);
  const ceiling = share.lt(settlementSubsidyMaxUsd) ? share : new Big(settlementSubsidyMaxUsd);
  const maxSubsidyUsd = ceiling.gt(MAX_FINAL_SETTLEMENT_SUBSIDY_USD) ? ceiling : new Big(MAX_FINAL_SETTLEMENT_SUBSIDY_USD);
  ctx.addNote(`StockSettlement: promising ${input.amountRaw} raw ${token}, top-up capped at ${maxSubsidyUsd.toFixed(2)} USD`);
  return {
    metadata: {
      amountRaw: input.amountRaw,
      maxSubsidyUsd: maxSubsidyUsd.toFixed(2),
      network: Networks.Robinhood,
      token
    },
    output: input
  };
}
