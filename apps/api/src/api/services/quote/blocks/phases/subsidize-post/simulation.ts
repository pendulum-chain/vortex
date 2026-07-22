import { getOnChainTokenDetails, multiplyByPowerOfTen, Networks, OnChainToken } from "@vortexfi/shared";
import Big from "big.js";
import { priceFeedService } from "../../../../priceFeed.service";
import { calculateExpectedOutput, calculateSubsidyAmount, resolveDiscountPartner } from "../../../engines/discount/helpers";
import { defineContext } from "../../core/metadata";
import type { ChainBrand, PhaseCtx, PhaseIO, PhaseResult, TokenBrand } from "../../core/types";
import { buildFullSubsidy, computeExpectedOutput, type SubsidyMetadata } from "../subsidize-pre/simulation";

export interface SubsidizePostMetadata extends SubsidyMetadata {
  network?: string;
  outputCurrency: string;
  outputCurrencyId?: ReturnType<typeof import("@vortexfi/shared").getPendulumDetails>["currencyId"];
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

export async function simulateOfframpSubsidizePost<Token extends TokenBrand, Chain extends ChainBrand>(
  input: PhaseIO<Token, Chain>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<Token, Chain>, SubsidizePostMetadata>> {
  const tokenDetails = getOnChainTokenDetails(input.chain as Networks, input.token as OnChainToken);
  if (!tokenDetails) {
    throw new Error(`OfframpSubsidizePost: Missing token details for ${input.token} on ${input.chain}`);
  }
  const partner = await resolveDiscountPartner(ctx as never, ctx.request.rampType);
  const oraclePrice = await priceFeedService.getFiatToUsdExchangeRate(ctx.request.outputCurrency);
  const { expectedOutput, adjustedDifference, adjustedTargetDiscount } = calculateExpectedOutput(
    ctx.request.inputAmount,
    oraclePrice,
    partner?.targetDiscount ?? 0,
    true,
    partner
  );
  const expectedWithAnchor = expectedOutput.plus(ctx.fees?.displayFiat?.anchor ?? 0);
  const expectedRaw = multiplyByPowerOfTen(expectedWithAnchor, tokenDetails.decimals).toFixed(0, 0);
  const actualRaw = multiplyByPowerOfTen(input.amount, tokenDetails.decimals).toFixed(0, 0);
  const idealSubsidy = input.amount.gte(expectedWithAnchor) ? new Big(0) : expectedWithAnchor.minus(input.amount);
  const subsidyUnrounded =
    (partner?.targetDiscount ?? 0) !== 0
      ? calculateSubsidyAmount(expectedWithAnchor, input.amount, partner?.maxSubsidy ?? 0)
      : new Big(0);
  const subsidy = new Big(subsidyUnrounded.toFixed(6, 0));
  const subsidyRaw = multiplyByPowerOfTen(subsidyUnrounded, tokenDetails.decimals).toFixed(0, 0);
  const targetAmount = input.amount.plus(subsidy);
  const targetRaw = new Big(actualRaw).plus(subsidyRaw).toFixed(0, 0);
  const metadata: SubsidizePostMetadata = {
    actualOutputAmountDecimal: input.amount,
    actualOutputAmountRaw: actualRaw,
    adjustedDifference,
    adjustedTargetDiscount,
    applied: subsidy.gt(0),
    expectedOutputAmountDecimal: expectedWithAnchor,
    expectedOutputAmountRaw: expectedRaw,
    idealSubsidyAmountInOutputTokenDecimal: new Big(idealSubsidy.toFixed(6, 0)),
    idealSubsidyAmountInOutputTokenRaw: multiplyByPowerOfTen(idealSubsidy, tokenDetails.decimals).toFixed(0, 0),
    outputCurrency: input.token,
    outputDecimals: tokenDetails.decimals,
    partnerId: partner?.id ?? null,
    subsidyAmountInOutputTokenDecimal: subsidy,
    subsidyAmountInOutputTokenRaw: subsidyRaw,
    subsidyRate: expectedWithAnchor.gt(0) ? subsidyUnrounded.div(expectedWithAnchor) : new Big(0),
    targetOutputAmountDecimal: targetAmount,
    targetOutputAmountRaw: targetRaw
  };
  return { metadata, output: { ...input, amount: targetAmount, amountRaw: targetRaw } };
}
