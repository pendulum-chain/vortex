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

/** What a top-up may cost: a share of the swap input, capped. */
export function goldSettlementSubsidyCapUsd(inputUsd: Big): Big {
  const { settlementSubsidyMaxBps, settlementSubsidyMaxUsd } = config.gold;
  const share = inputUsd.mul(settlementSubsidyMaxBps).div(10_000);
  return share.lt(settlementSubsidyMaxUsd) ? share : new Big(settlementSubsidyMaxUsd);
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
