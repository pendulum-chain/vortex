import { RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import Partner from "../../../../../models/partner.model";
import { QuoteContext } from "../../core/types";

export const DEFAULT_PARTNER_NAME = "vortex";

export type ActivePartner = Pick<Partner, "id" | "targetDiscount" | "maxSubsidy" | "name"> | null;

export interface DiscountSubsidyPayload {
  actualOutputAmountDecimal: Big;
  actualOutputAmountRaw: string;
  expectedOutputAmountDecimal: Big;
}

export async function resolveDiscountPartner(ctx: QuoteContext, rampType: RampDirection): Promise<ActivePartner> {
  const partnerId = ctx.partner?.id;

  const where = {
    isActive: true,
    rampType
  } as const;

  if (partnerId) {
    const partner = await Partner.findOne({
      where: {
        ...where,
        id: partnerId
      }
    });

    if (partner) {
      return partner;
    }
  }

  return Partner.findOne({
    where: {
      ...where,
      name: DEFAULT_PARTNER_NAME
    }
  });
}

/**
 * Calculate expected output amount based on oracle price and target discount
 * @param inputAmount - The input amount from the request
 * @param oraclePrice - The oracle price (FIAT-USD format, e.g., BRL-USD)
 * @param targetDiscount - The target discount rate to apply
 * @param isOfframp - Whether this is an offramp (requires price inversion)
 * @returns Expected output amount
 */
export function calculateExpectedOutput(
  inputAmount: string,
  oraclePrice: Big,
  targetDiscount: number,
  isOfframp: boolean
): Big {
  const inputAmountBig = new Big(inputAmount);

  // For offramps, we need to invert the oracle price
  // Oracle price is FIAT-USD, so for offramps we want USD-FIAT
  const effectivePrice = isOfframp ? new Big(1).div(oraclePrice) : oraclePrice;

  // Apply target discount to the rate
  const discountedRate = effectivePrice.mul(new Big(1).plus(targetDiscount));
  return inputAmountBig.mul(discountedRate);
}

/**
 * Calculate the subsidy amount by comparing expected vs actual output
 * Caps at maxSubsidy if configured
 * @param expectedOutput - The expected output amount
 * @param actualOutput - The actual output amount from nabla swap
 * @param maxSubsidy - Maximum subsidy rate (decimal)
 * @returns Subsidy amount as Big
 */
export function calculateSubsidyAmount(expectedOutput: Big, actualOutput: Big, maxSubsidy: number): Big {
  // If actual output is already >= expected, no subsidy needed
  if (actualOutput.gte(expectedOutput)) {
    return new Big(0);
  }

  const shortfall = expectedOutput.minus(actualOutput);

  // Cap at maxSubsidy if configured
  const maxSubsidyBig = new Big(maxSubsidy);
  if (maxSubsidy > 0) {
    const maxAllowedSubsidy = expectedOutput.mul(maxSubsidyBig);
    return shortfall.gt(maxAllowedSubsidy) ? maxAllowedSubsidy : shortfall;
  }
  return shortfall;
}

export function buildDiscountSubsidy(
  subsidyAmount: Big,
  idealSubsidyAmount: Big,
  partner: ActivePartner,
  payload: DiscountSubsidyPayload
): QuoteContext["subsidy"] {
  // Trim to 6 decimal places for output token decimal representation
  const subsidyAmountInOutputTokenDecimal = Big(subsidyAmount.toFixed(6, 0));
  const subsidyAmountInOutputTokenRaw = subsidyAmount
    .mul(new Big(payload.actualOutputAmountRaw))
    .div(payload.actualOutputAmountDecimal)
    .toFixed(0, 0);

  // Calculate ideal (uncapped) subsidy amounts
  const idealSubsidyAmountInOutputTokenDecimal = Big(idealSubsidyAmount.toFixed(6, 0));
  const idealSubsidyAmountInOutputTokenRaw = idealSubsidyAmount
    .mul(new Big(payload.actualOutputAmountRaw))
    .div(payload.actualOutputAmountDecimal)
    .toFixed(0, 0);

  const rate = payload.expectedOutputAmountDecimal.gt(0) ? subsidyAmount.div(payload.expectedOutputAmountDecimal) : new Big(0);

  return {
    applied: subsidyAmount.gt(0),
    idealSubsidyAmountInOutputTokenDecimal,
    idealSubsidyAmountInOutputTokenRaw,
    partnerId: partner?.id,
    rate: rate.toString(),
    subsidyAmountInOutputTokenDecimal,
    subsidyAmountInOutputTokenRaw
  };
}

export function formatPartnerNote(
  partner: ActivePartner,
  targetDiscount: number,
  maxSubsidy: number,
  actualSubsidyAmount: Big,
  idealSubsidyAmount: Big
): string {
  const isCapped = actualSubsidyAmount.lt(idealSubsidyAmount);
  return (
    `partner=${partner?.name || DEFAULT_PARTNER_NAME} (${partner?.id || "N/A"}), ` +
    `targetDiscount=${targetDiscount}, maxSubsidy=${maxSubsidy}, ` +
    `idealSubsidy=${idealSubsidyAmount.toString()}, ` +
    `actualSubsidy=${actualSubsidyAmount.toString()}` +
    (isCapped ? ` [CAPPED]` : ``)
  );
}
