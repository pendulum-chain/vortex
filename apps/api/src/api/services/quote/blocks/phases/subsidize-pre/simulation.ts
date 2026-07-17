import { RampDirection } from "@vortexfi/shared";
import { Big } from "big.js";
import { priceFeedService } from "../../../../priceFeed.service";
import type { ChainBrand, PhaseCtx, PhaseIO, TokenBrand } from "../../core/types";

export interface SubsidyMeta {
  applied: boolean;
  subsidyRate: Big;
  partnerId: string | null;
  expectedOutputAmountDecimal: Big;
  expectedOutputAmountRaw: string;
  actualOutputAmountDecimal: Big;
  actualOutputAmountRaw: string;
  subsidyAmountInOutputTokenDecimal: Big;
  subsidyAmountInOutputTokenRaw: string;
  idealSubsidyAmountInOutputTokenDecimal: Big;
  idealSubsidyAmountInOutputTokenRaw: string;
  targetOutputAmountDecimal: Big;
  targetOutputAmountRaw: string;
  adjustedDifference: Big;
  adjustedTargetDiscount: Big;
}

export function buildFullSubsidy(
  actualOutputAmountDecimal: Big,
  actualOutputAmountRaw: string,
  expectedOutputAmountDecimal: Big,
  expectedOutputAmountRaw: string,
  ctx: PhaseCtx
): SubsidyMeta {
  const partner = ctx.partner;
  const targetDiscount = partner?.targetDiscount ?? 0;
  const maxSubsidy = partner?.maxSubsidy ?? 0;
  const idealSubsidyAmountInOutputTokenDecimal = actualOutputAmountDecimal.gte(expectedOutputAmountDecimal)
    ? new Big(0)
    : expectedOutputAmountDecimal.minus(actualOutputAmountDecimal);
  const subsidyAmountInOutputTokenDecimal =
    targetDiscount !== 0
      ? capSubsidy(idealSubsidyAmountInOutputTokenDecimal, expectedOutputAmountDecimal, maxSubsidy)
      : new Big(0);
  const targetOutputAmountDecimal = actualOutputAmountDecimal.plus(subsidyAmountInOutputTokenDecimal);
  const subsidyRate = expectedOutputAmountDecimal.gt(0)
    ? subsidyAmountInOutputTokenDecimal.div(expectedOutputAmountDecimal)
    : new Big(0);
  const toRaw = (decimal: Big): string =>
    actualOutputAmountDecimal.gt(0)
      ? new Big(actualOutputAmountRaw).times(decimal).div(actualOutputAmountDecimal).toFixed(0, 0)
      : "0";

  return {
    actualOutputAmountDecimal,
    actualOutputAmountRaw,
    adjustedDifference: new Big(0),
    adjustedTargetDiscount: new Big(0),
    applied: subsidyAmountInOutputTokenDecimal.gt(0),
    expectedOutputAmountDecimal,
    expectedOutputAmountRaw,
    idealSubsidyAmountInOutputTokenDecimal,
    idealSubsidyAmountInOutputTokenRaw: toRaw(idealSubsidyAmountInOutputTokenDecimal),
    partnerId: partner?.id ?? null,
    subsidyAmountInOutputTokenDecimal,
    subsidyAmountInOutputTokenRaw: toRaw(subsidyAmountInOutputTokenDecimal),
    subsidyRate,
    targetOutputAmountDecimal,
    targetOutputAmountRaw: toRaw(targetOutputAmountDecimal)
  };
}

function capSubsidy(idealSubsidy: Big, expectedOutput: Big, maxSubsidy: number): Big {
  if (maxSubsidy > 0) {
    const maxAllowed = expectedOutput.mul(maxSubsidy);
    return idealSubsidy.gt(maxAllowed) ? maxAllowed : idealSubsidy;
  }
  return idealSubsidy;
}

export async function computeExpectedOutput(ctx: PhaseCtx): Promise<{ decimal: Big; raw: string }> {
  let expectedOutputAmount = new Big(ctx.request.inputAmount);
  try {
    const oraclePrice = await priceFeedService.getFiatToUsdExchangeRate(ctx.request.inputCurrency);
    const isOfframp = ctx.request.rampType === RampDirection.SELL;
    const effectivePrice = isOfframp ? new Big(1).div(oraclePrice) : oraclePrice;
    const targetDiscount = ctx.partner?.targetDiscount ?? 0;
    const discountedRate = effectivePrice.mul(new Big(1).plus(targetDiscount));
    expectedOutputAmount = new Big(ctx.request.inputAmount).mul(discountedRate);
  } catch (error) {
    ctx.addNote(`computeExpectedOutput: oracle price unavailable, using input amount. Error: ${error}`);
  }
  const expectedOutputAmountRaw = expectedOutputAmount.times(new Big(10).pow(6)).toFixed(0, 0);
  return { decimal: expectedOutputAmount, raw: expectedOutputAmountRaw };
}

export async function simulateSubsidizePre<Token extends TokenBrand, Chain extends ChainBrand>(
  input: PhaseIO<Token, Chain>,
  ctx: PhaseCtx
): Promise<PhaseIO<Token, Chain>> {
  const expected = await computeExpectedOutput(ctx);
  ctx.addNote(`SubsidizePre: expected output ${expected.decimal.toFixed()} ${input.token}`);
  return {
    ...input,
    meta: {
      ...input.meta,
      subsidy: {
        expectedOutputAmountDecimal: expected.decimal,
        expectedOutputAmountRaw: expected.raw
      }
    }
  };
}
