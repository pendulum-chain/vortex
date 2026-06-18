import Big from "big.js";
import type { ChainBrand, Phase, PhaseCtx, PhaseIO, TokenBrand } from "../core/types";
import { buildFullSubsidy, computeExpectedOutput } from "./subsidize-pre";

export function SubsidizePost<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    name: "SubsidizePost",
    phases: ["subsidizePostSwap"],
    async simulate(input: PhaseIO<Token, Chain>, ctx: PhaseCtx): Promise<PhaseIO<Token, Chain>> {
      const expected = await computeExpectedOutput(ctx);
      const subsidy = buildFullSubsidy(input.amount, input.amountRaw, expected.decimal, expected.raw, ctx);
      const newAmount = input.amount.plus(subsidy.subsidyAmountInOutputTokenDecimal);
      const newAmountRaw = new Big(input.amountRaw).plus(subsidy.subsidyAmountInOutputTokenRaw).toFixed(0, 0);
      ctx.addNote(
        `SubsidizePost: applied=${subsidy.applied}, subsidy=${subsidy.subsidyAmountInOutputTokenDecimal.toFixed()}, newAmount=${newAmount.toFixed()}`
      );
      return {
        ...input,
        amount: newAmount,
        amountRaw: newAmountRaw,
        meta: { ...input.meta, subsidy }
      };
    }
  };
}
