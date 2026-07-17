import type { ChainBrand, PhaseCtx, PhaseIO, TokenBrand } from "../../core/types";
import { buildFullSubsidy, computeExpectedOutput } from "../subsidize-pre/simulation";

export async function simulateFinalSettlementSubsidy<Token extends TokenBrand, Chain extends ChainBrand>(
  input: PhaseIO<Token, Chain>,
  ctx: PhaseCtx
): Promise<PhaseIO<Token, Chain>> {
  const expected = await computeExpectedOutput(ctx);
  const subsidy = buildFullSubsidy(input.amount, input.amountRaw, expected.decimal, expected.raw, ctx);
  ctx.addNote(`FinalSettlementSubsidy: finalized, amount=${subsidy.subsidyAmountInOutputTokenDecimal.toFixed()}`);
  return { ...input, meta: { ...input.meta, subsidy } };
}
