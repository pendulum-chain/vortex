import {
  EvmToken,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  multiplyByPowerOfTen,
  Networks,
  OnChainToken
} from "@vortexfi/shared";
import Big from "big.js";
import { priceFeedService } from "../../../../priceFeed.service";
import {
  calculateExpectedOutput,
  calculateSubsidyAmount,
  getUsdDenominatedInputAmount,
  resolveDiscountPartner
} from "../../core/discount";
import { defineContext } from "../../core/metadata";
import { getEvmBridgeQuote } from "../../core/squidrouter";
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
  const tokenDetails = getOnChainTokenDetails(input.chain as Networks, input.token as OnChainToken);
  if (!tokenDetails) {
    throw new Error(`SubsidizePost: Missing token details for ${input.token} on ${input.chain}`);
  }
  const partner = await resolveDiscountPartner(ctx, ctx.request.rampType);
  const oraclePrice = await priceFeedService.getFiatToUsdExchangeRate(ctx.request.inputCurrency);
  const { expectedOutput, adjustedDifference, adjustedTargetDiscount } = calculateExpectedOutput(
    ctx.request.inputAmount,
    oraclePrice,
    partner?.targetDiscount ?? 0,
    false,
    partner
  );
  let adjustedExpectedOutput = expectedOutput;
  const toNetwork = getNetworkFromDestination(ctx.request.to);
  if (toNetwork && !(toNetwork === Networks.Base && ctx.request.outputCurrency === EvmToken.USDC)) {
    try {
      const bridge = await getEvmBridgeQuote({
        amountDecimal: expectedOutput.toString(),
        fromNetwork: Networks.Base,
        inputCurrency: EvmToken.USDC,
        outputCurrency: ctx.request.outputCurrency as OnChainToken,
        toNetwork
      });
      if (expectedOutput.gt(0) && bridge.outputAmountDecimal.gt(0)) {
        const conversionRate = bridge.outputAmountDecimal.div(expectedOutput);
        adjustedExpectedOutput = expectedOutput.div(conversionRate);
      }
    } catch (error) {
      ctx.addNote(`SubsidizePost: Squid conversion unavailable, using 1:1. Error: ${error}`);
    }
  }
  const expectedRaw = multiplyByPowerOfTen(adjustedExpectedOutput, tokenDetails.decimals).toFixed(0, 0);
  const idealSubsidy = input.amount.gte(adjustedExpectedOutput) ? new Big(0) : adjustedExpectedOutput.minus(input.amount);
  const subsidyUnrounded = new Big(partner?.targetDiscount ?? 0).gt(0)
    ? calculateSubsidyAmount(adjustedExpectedOutput, input.amount, partner?.maxSubsidy ?? 0)
    : new Big(0);
  // Floor the subsidy to token decimals before adding it, so the output decimal/raw pair stays
  // floor-consistent and quote.outputAmount cannot exceed the funded raw by one unit.
  const subsidyAmount = new Big(subsidyUnrounded.toFixed(tokenDetails.decimals, 0));
  const subsidyRaw = multiplyByPowerOfTen(subsidyAmount, tokenDetails.decimals).toFixed(0, 0);
  const newAmount = input.amount.plus(subsidyAmount);
  const newAmountRaw = new Big(input.amountRaw).plus(subsidyRaw).toFixed(0, 0);
  const subsidy: SubsidyMetadata = {
    actualOutputAmountDecimal: input.amount,
    actualOutputAmountRaw: input.amountRaw,
    adjustedDifference,
    adjustedTargetDiscount,
    applied: subsidyAmount.gt(0),
    expectedOutputAmountDecimal: adjustedExpectedOutput,
    expectedOutputAmountRaw: expectedRaw,
    idealSubsidyAmountInOutputTokenDecimal: idealSubsidy,
    idealSubsidyAmountInOutputTokenRaw: multiplyByPowerOfTen(idealSubsidy, tokenDetails.decimals).toFixed(0, 0),
    partnerId: partner?.id ?? null,
    subsidyAmountInOutputTokenDecimal: subsidyAmount,
    subsidyAmountInOutputTokenRaw: subsidyRaw,
    subsidyRate: adjustedExpectedOutput.gt(0) ? subsidyAmount.div(adjustedExpectedOutput) : new Big(0),
    targetOutputAmountDecimal: newAmount,
    targetOutputAmountRaw: newAmountRaw
  };
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
  const partner = await resolveDiscountPartner(ctx, ctx.request.rampType);
  const oraclePrice = await priceFeedService.getFiatToUsdExchangeRate(ctx.request.outputCurrency);
  const inputAmountUsd = await getUsdDenominatedInputAmount(
    Object.assign(
      {},
      ctx,
      input.requestInputAmountUsd ? { evmToEvm: { outputAmountDecimal: input.requestInputAmountUsd } } : {}
    ) as never
  );
  if (!inputAmountUsd.eq(ctx.request.inputAmount)) {
    ctx.addNote(
      `OfframpSubsidizePost: valued input ${ctx.request.inputAmount} ${ctx.request.inputCurrency} at ${inputAmountUsd.toFixed(6)} USD for discount calculation`
    );
  }
  const { expectedOutput, adjustedDifference, adjustedTargetDiscount } = calculateExpectedOutput(
    inputAmountUsd.toString(),
    oraclePrice,
    partner?.targetDiscount ?? 0,
    true,
    partner
  );
  const expectedWithAnchor = expectedOutput.plus(ctx.fees?.displayFiat?.anchor ?? 0);
  const expectedRaw = multiplyByPowerOfTen(expectedWithAnchor, tokenDetails.decimals).toFixed(0, 0);
  const actualRaw = input.amountRaw;
  const idealSubsidy = input.amount.gte(expectedWithAnchor) ? new Big(0) : expectedWithAnchor.minus(input.amount);
  const subsidyUnrounded = new Big(partner?.targetDiscount ?? 0).gt(0)
    ? calculateSubsidyAmount(expectedWithAnchor, input.amount, partner?.maxSubsidy ?? 0)
    : new Big(0);
  const subsidy = new Big(subsidyUnrounded.toFixed(6, 0));
  const subsidyRaw = multiplyByPowerOfTen(subsidy, tokenDetails.decimals).toFixed(0, 0);
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
    subsidyRate: expectedWithAnchor.gt(0) ? subsidy.div(expectedWithAnchor) : new Big(0),
    targetOutputAmountDecimal: targetAmount,
    targetOutputAmountRaw: targetRaw
  };
  return { metadata, output: { ...input, amount: targetAmount, amountRaw: targetRaw } };
}
