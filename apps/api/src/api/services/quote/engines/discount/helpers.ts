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
  // For onramps: better rate = higher USD output per FIAT input
  // For offramps: better rate = higher FIAT output per USD input
  const discountedRate = effectivePrice.mul(new Big(1).plus(targetDiscount));

  // Calculate expected output
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

  // Calculate the difference (shortfall)
  const shortfall = expectedOutput.minus(actualOutput);

  // Calculate the shortfall as a percentage of expected output
  const shortfallRate = shortfall.div(expectedOutput);

  // Cap at maxSubsidy if configured
  const maxSubsidyBig = new Big(maxSubsidy);
  const effectiveSubsidyRate = maxSubsidy > 0 && shortfallRate.gt(maxSubsidyBig) ? maxSubsidyBig : shortfallRate;

  // Calculate final subsidy amount based on expected output
  return expectedOutput.mul(effectiveSubsidyRate);
}

/**
 * Resolve the active discount partner for the quote
 * @param ctx - Quote context
 * @param rampType - Direction of the ramp
 * @returns Active partner or null
 */
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
 * Build the subsidy object for the quote context
 * @param subsidyAmount - Calculated subsidy amount
 * @param partner - Active partner
 * @param payload - Payload with actual and expected amounts
 * @returns Subsidy object for context
 */
export function buildDiscountSubsidy(
  subsidyAmount: Big,
  partner: ActivePartner,
  payload: DiscountSubsidyPayload
): QuoteContext["subsidy"] {
  // Trim to 6 decimal places for output token decimal representation
  const subsidyAmountInOutputTokenDecimal = Big(subsidyAmount.toFixed(6, 0));
  const rate = payload.expectedOutputAmountDecimal.gt(0) ? subsidyAmount.div(payload.expectedOutputAmountDecimal) : new Big(0);

  // Calculate raw subsidy amount (maintain precision)
  const subsidyAmountInOutputTokenRaw = subsidyAmount
    .mul(new Big(payload.actualOutputAmountRaw))
    .div(payload.actualOutputAmountDecimal)
    .toFixed(0, 0);

  return {
    applied: subsidyAmount.gt(0),
    partnerId: partner?.id,
    rate: rate.toString(),
    subsidyAmountInOutputTokenDecimal,
    subsidyAmountInOutputTokenRaw
  };
}

/**
 * Format a note about the partner discount configuration
 * @param partner - Active partner
 * @param targetDiscount - Target discount rate
 * @param maxSubsidy - Maximum subsidy rate
 * @param subsidyAmount - Calculated subsidy amount
 * @returns Formatted note string
 */
export function formatPartnerNote(
  partner: ActivePartner,
  targetDiscount: number,
  maxSubsidy: number,
  subsidyAmount: Big
): string {
  return (
    `partner=${partner?.name || DEFAULT_PARTNER_NAME} (${partner?.id || "N/A"}), ` +
    `targetDiscount=${targetDiscount}, maxSubsidy=${maxSubsidy}, ` +
    `calculatedSubsidy=${subsidyAmount.toString()}`
  );
}
