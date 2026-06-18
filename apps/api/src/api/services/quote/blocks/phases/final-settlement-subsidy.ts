import type { ChainBrand, Phase, PhaseCtx, PhaseIO, TokenBrand } from "../core/types";
import { buildFullSubsidy, computeExpectedOutput } from "./subsidize-pre";

export function FinalSettlementSubsidy<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    name: "FinalSettlementSubsidy",
    phases: ["finalSettlementSubsidy"],
    async simulate(input: PhaseIO<Token, Chain>, ctx: PhaseCtx): Promise<PhaseIO<Token, Chain>> {
      const expected = await computeExpectedOutput(ctx);
      const subsidy = buildFullSubsidy(input.amount, input.amountRaw, expected.decimal, expected.raw, ctx);
      ctx.addNote(`FinalSettlementSubsidy: finalized, amount=${subsidy.subsidyAmountInOutputTokenDecimal.toFixed()}`);
      return { ...input, meta: { ...input.meta, subsidy } };
    }
  };
}
