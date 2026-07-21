import { getOnChainTokenDetails, Networks, OnChainToken } from "@vortexfi/shared";
import Big from "big.js";
import { defineContext } from "../../core/metadata";
import type { ChainBrand, PhaseCtx, PhaseIO, PhaseResult, TokenBrand } from "../../core/types";
import { buildFullSubsidy, computeExpectedOutput, type SubsidyMetadata } from "../subsidize-pre/simulation";

export interface SubsidizePostMetadata extends SubsidyMetadata {
  outputCurrency: string;
  outputDecimals: number;
}

export const SubsidizePostContext = defineContext<SubsidizePostMetadata>()("subsidizePostSwap");

export async function simulateSubsidizePost<Token extends TokenBrand, Chain extends ChainBrand>(
  input: PhaseIO<Token, Chain>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<Token, Chain>, SubsidizePostMetadata>> {
  const expected = await computeExpectedOutput(ctx);
  const tokenDetails = getOnChainTokenDetails(input.chain as Networks, input.token as OnChainToken);
  if (!tokenDetails) {
    throw new Error(`SubsidizePost: Missing token details for ${input.token} on ${input.chain}`);
  }
  const subsidy = buildFullSubsidy(input.amount, input.amountRaw, expected.decimal, expected.raw, ctx);
  const newAmount = input.amount.plus(subsidy.subsidyAmountInOutputTokenDecimal);
  const newAmountRaw = new Big(input.amountRaw).plus(subsidy.subsidyAmountInOutputTokenRaw).toFixed(0, 0);
  ctx.addNote(
    `SubsidizePost: applied=${subsidy.applied}, subsidy=${Big(subsidy.subsidyAmountInOutputTokenDecimal).toFixed()}, newAmount=${newAmount.toFixed()}`
  );
  return {
    metadata: { ...subsidy, outputCurrency: input.token, outputDecimals: tokenDetails.decimals },
    output: { ...input, amount: newAmount, amountRaw: newAmountRaw }
  };
}
