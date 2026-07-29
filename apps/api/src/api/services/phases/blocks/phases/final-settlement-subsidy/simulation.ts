import Big from "big.js";
import { defineContext } from "../../core/metadata";
import type { ChainBrand, PhaseCtx, PhaseIO, PhaseResult, TokenBrand } from "../../core/types";
import { buildFullSubsidy, computeExpectedOutput, type SubsidyMetadata } from "../subsidize-pre/simulation";

export interface FinalSettlementSubsidyMetadata extends SubsidyMetadata {
  amountRaw: string;
  network: string;
  token: string;
}

export const FinalSettlementSubsidyContext = defineContext<FinalSettlementSubsidyMetadata>()("finalSettlementSubsidy");

export async function simulateFinalSettlementSubsidy<Token extends TokenBrand, Chain extends ChainBrand>(
  input: PhaseIO<Token, Chain>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<Token, Chain>, FinalSettlementSubsidyMetadata>> {
  const expected = await computeExpectedOutput(ctx);
  const subsidy = buildFullSubsidy(input.amount, input.amountRaw, expected.decimal, expected.raw, ctx);
  ctx.addNote(`FinalSettlementSubsidy: finalized, amount=${Big(subsidy.subsidyAmountInOutputTokenDecimal).toFixed()}`);
  return {
    metadata: { ...subsidy, amountRaw: input.amountRaw, network: input.chain, token: input.token },
    output: input
  };
}
