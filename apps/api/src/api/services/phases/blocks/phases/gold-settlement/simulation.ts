import { Networks } from "@vortexfi/shared";
import Big from "big.js";
import { config } from "../../../../../../config/vars";
import { GOLD_TOKEN } from "../../core/gold-base";
import { defineContext } from "../../core/metadata";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";

export interface GoldSettlementMetadata {
  amountRaw: string;
  maxSubsidyUsd: string;
}

export const GoldSettlementContext = defineContext<GoldSettlementMetadata>()("goldSettlement");

/**
 * What delivering a Gold order at its quote may cost the funding wallet, on a buy and on a sale: a share of the trade,
 * capped, but never below the floor that keeps small orders from waiting on every tick.
 */
export function goldSettlementSubsidyCapUsd(tradeUsd: Big): Big {
  const { settlementSubsidyMaxBps, settlementSubsidyMaxUsd, settlementSubsidyMinUsd } = config.gold;
  const share = tradeUsd.mul(settlementSubsidyMaxBps).div(10_000);
  const ceiling = share.lt(settlementSubsidyMaxUsd) ? share : new Big(settlementSubsidyMaxUsd);
  return ceiling.gt(settlementSubsidyMinUsd) ? ceiling : new Big(settlementSubsidyMinUsd);
}

/** Pass-through. Records the exact amount promised and how much Vortex may spend to deliver it. */
export async function simulateGoldSettlement(
  input: PhaseIO<typeof GOLD_TOKEN, typeof Networks.Base>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<typeof GOLD_TOKEN, typeof Networks.Base>, GoldSettlementMetadata>> {
  if (input.chain !== Networks.Base || input.token !== GOLD_TOKEN || !input.requestInputAmountUsd) {
    throw new Error(`GoldSettlement requires ${GOLD_TOKEN} on ${Networks.Base} with its USD value`);
  }
  // Rounded down, so the recorded cap never exceeds the margin the swap's soft minimum was sized with.
  const maxSubsidyUsd = goldSettlementSubsidyCapUsd(input.requestInputAmountUsd).toFixed(6, Big.roundDown);
  ctx.addNote(`GoldSettlement: promising ${input.amountRaw} raw ${GOLD_TOKEN}, top-up capped at ${maxSubsidyUsd} USD`);
  return { metadata: { amountRaw: input.amountRaw, maxSubsidyUsd }, output: input };
}
