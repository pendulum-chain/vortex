import { getOnChainTokenDetails, multiplyByPowerOfTen, Networks, OnChainToken, RampDirection } from "@vortexfi/shared";
import { Big } from "big.js";
import { findPartnerWithPricing } from "../../../../partners/partner-pricing.service";
import { priceFeedService } from "../../../../priceFeed.service";
import {
  calculateExpectedOutput,
  calculateSubsidyAmount,
  DEFAULT_PARTNER_NAME,
  resolveActivePartnerById,
  toActivePartner
} from "../../../engines/discount/helpers";
import { evmIO } from "../../core/io";
import { defineContext, type SerializableBig } from "../../core/metadata";
import type { ChainBrand, PhaseCtx, PhaseIO, PhaseResult, TokenBrand } from "../../core/types";

export interface SubsidyMetadata {
  actualOutputAmountDecimal: SerializableBig;
  actualOutputAmountRaw: string;
  adjustedDifference: SerializableBig;
  adjustedTargetDiscount: SerializableBig;
  applied: boolean;
  expectedOutputAmountDecimal: SerializableBig;
  expectedOutputAmountRaw: string;
  idealSubsidyAmountInOutputTokenDecimal: SerializableBig;
  idealSubsidyAmountInOutputTokenRaw: string;
  partnerId: string | null;
  subsidyAmountInOutputTokenDecimal: SerializableBig;
  subsidyAmountInOutputTokenRaw: string;
  subsidyRate: SerializableBig;
  targetOutputAmountDecimal: SerializableBig;
  targetOutputAmountRaw: string;
}

export interface SubsidizePreMetadata {
  applied?: boolean;
  expectedOutputAmountDecimal: SerializableBig;
  expectedOutputAmountRaw: string;
  inputCurrency: string;
  inputDecimals: number;
  network: string;
  outputCurrency?: string;
  subsidyAmountInOutputTokenDecimal?: SerializableBig;
  targetInputAmountRaw: string;
}

export const SubsidizePreContext = defineContext<SubsidizePreMetadata>()("subsidizePreSwap");

export function buildFullSubsidy(
  actualOutputAmountDecimal: Big,
  actualOutputAmountRaw: string,
  expectedOutputAmountDecimal: Big,
  expectedOutputAmountRaw: string,
  ctx: PhaseCtx
): SubsidyMetadata {
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
): Promise<PhaseResult<PhaseIO<Token, Chain>, SubsidizePreMetadata>> {
  const expected = await computeExpectedOutput(ctx);
  const tokenDetails = getOnChainTokenDetails(input.chain as Networks, input.token as OnChainToken);
  if (!tokenDetails) {
    throw new Error(`SubsidizePre: Missing token details for ${input.token} on ${input.chain}`);
  }
  ctx.addNote(`SubsidizePre: expected output ${expected.decimal.toFixed()} ${input.token}`);
  return {
    metadata: {
      expectedOutputAmountDecimal: expected.decimal,
      expectedOutputAmountRaw: expected.raw,
      inputCurrency: input.token,
      inputDecimals: tokenDetails.decimals,
      network: input.chain,
      targetInputAmountRaw: input.amountRaw
    },
    output: input
  };
}

export async function simulateAlfredpaySubsidizePre<Token extends TokenBrand, Chain extends ChainBrand>(
  input: PhaseIO<Token, Chain>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<Token, Chain>, SubsidizePreMetadata>> {
  if (!ctx.fees?.usd) {
    throw new Error("AlfredpaySubsidizePre: Missing provider-adjusted fees");
  }
  const tokenDetails = getOnChainTokenDetails(input.chain as Networks, input.token as OnChainToken);
  if (!tokenDetails) {
    throw new Error(`AlfredpaySubsidizePre: Missing token details for ${input.token} on ${input.chain}`);
  }
  const activePartner = ctx.partner?.id
    ? await resolveActivePartnerById(ctx.partner.id, ctx.request.rampType)
    : await findPartnerWithPricing({ name: DEFAULT_PARTNER_NAME }, ctx.request.rampType).then(partner =>
        partner ? toActivePartner(partner) : null
      );
  const targetDiscount = activePartner?.targetDiscount ?? 0;
  const maxSubsidy = activePartner?.maxSubsidy ?? 0;
  const effectiveRate = input.amount.div(ctx.request.inputAmount);
  const actualOutput = input.amount.minus(ctx.fees.usd.vortex).minus(ctx.fees.usd.partnerMarkup);
  const { expectedOutput } = calculateExpectedOutput(
    ctx.request.inputAmount,
    effectiveRate,
    targetDiscount,
    false,
    activePartner
  );
  const subsidy = targetDiscount !== 0 ? calculateSubsidyAmount(expectedOutput, actualOutput, maxSubsidy) : new Big(0);
  const targetOutput = actualOutput.plus(subsidy);
  const toRaw = (amount: Big) => multiplyByPowerOfTen(amount, tokenDetails.decimals).toFixed(0, 0);

  ctx.addNote(`AlfredpaySubsidizePre: bridge target ${targetOutput.toFixed()} ${input.token}`);
  return {
    metadata: {
      applied: subsidy.gt(0),
      expectedOutputAmountDecimal: expectedOutput,
      expectedOutputAmountRaw: toRaw(expectedOutput),
      inputCurrency: input.token,
      inputDecimals: tokenDetails.decimals,
      network: input.chain,
      outputCurrency: input.token,
      subsidyAmountInOutputTokenDecimal: subsidy,
      targetInputAmountRaw: toRaw(targetOutput)
    },
    output: evmIO(input.token, input.chain, targetOutput, toRaw(targetOutput))
  };
}
