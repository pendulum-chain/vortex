import { RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import Partner from "../../../../../models/partner.model";
import { QuoteContext } from "../../core/types";
import { DiscountComputation } from "./index";

export const DEFAULT_PARTNER_NAME = "vortex";

const DISCOUNT_STATE_TIMEOUT_MINUTES = 1;
const DELTA_D_BASIS_POINTS = 0.3;
const MAX_DIFFERENCE_CAP = 10;
const MIN_DIFFERENCE_CAP = -10;

const partnerDiscountState = new Map<string, { lastQuoteTimestamp: Date | null; difference: Big }>();

function getDeltaD(): Big {
  return new Big(DELTA_D_BASIS_POINTS).div(100);
}

export { partnerDiscountState, DISCOUNT_STATE_TIMEOUT_MINUTES, getDeltaD };

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
 * @param partnerId - Partner ID for state management
 * @returns Expected output amount
 */
export function calculateExpectedOutput(
  inputAmount: string,
  oraclePrice: Big,
  targetDiscount: number,
  isOfframp: boolean,
  partnerId?: string | null
): Big {
  const inputAmountBig = new Big(inputAmount);

  // For offramps, we need to invert the oracle price
  // Oracle price is FIAT-USD, so for offramps we want USD-FIAT
  const effectivePrice = isOfframp ? new Big(1).div(oraclePrice) : oraclePrice;

  // Apply target discount to the rate, adjusting first for dynamic penalty
  const adjustedTargetDiscount = new Big(targetDiscount).minus(getAdjustedDifference(partnerId));
  const discountedRate = effectivePrice.mul(new Big(1).plus(adjustedTargetDiscount));
  return inputAmountBig.mul(discountedRate);
}

export function getAdjustedDifference(partnerId?: string | null): Big {
  if (!partnerId) {
    return new Big(0);
  }

  const partnerState = partnerDiscountState.get(partnerId);
  const now = new Date();

  if (!partnerState) {
    partnerDiscountState.set(partnerId, { difference: new Big(0), lastQuoteTimestamp: now });
    return new Big(0);
  }

  if (!partnerState.lastQuoteTimestamp) {
    partnerDiscountState.set(partnerId, { difference: partnerState.difference, lastQuoteTimestamp: now });
    return partnerState.difference;
  }

  const isYounger = now.getTime() - partnerState.lastQuoteTimestamp.getTime() < DISCOUNT_STATE_TIMEOUT_MINUTES * 60 * 1000;

  if (!isYounger) {
    const updatedDifference = partnerState.difference.minus(getDeltaD());
    const clampedDifference = updatedDifference.lt(MIN_DIFFERENCE_CAP) ? Big(MIN_DIFFERENCE_CAP) : updatedDifference;
    partnerDiscountState.set(partnerId, { difference: clampedDifference, lastQuoteTimestamp: now });
    return clampedDifference;
  } else {
    // Return existing difference
    return partnerState.difference;
  }
}
export function handleQuoteConsumptionForDiscountState(partnerId: string | null): void {
  if (!partnerId) {
    return;
  }

  const partnerState = partnerDiscountState.get(partnerId);
  const now = new Date();

  if (!partnerState || !partnerState.lastQuoteTimestamp) {
    // This state should not exist. Only in case of server shut down and loss of state.
    return;
  }

  const isYounger = now.getTime() - partnerState.lastQuoteTimestamp.getTime() < DISCOUNT_STATE_TIMEOUT_MINUTES * 60 * 1000;

  if (isYounger) {
    const updatedDifference = partnerState.difference.plus(getDeltaD());
    const clampedDifference = updatedDifference.gt(MAX_DIFFERENCE_CAP) ? Big(MAX_DIFFERENCE_CAP) : updatedDifference;
    partnerDiscountState.set(partnerId, { difference: clampedDifference, lastQuoteTimestamp: null });
  }
}

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

export function buildDiscountSubsidy(computation: DiscountComputation): QuoteContext["subsidy"] {
  // Trim to 6 decimal places for output token decimal representation
  const subsidyAmountInOutputTokenDecimal = Big(computation.subsidyAmountInOutputTokenDecimal.toFixed(6, 0));
  const idealSubsidyAmountInOutputTokenDecimal = Big(computation.idealSubsidyAmountInOutputTokenDecimal.toFixed(6, 0));

  return {
    ...computation,
    applied: computation.subsidyAmountInOutputTokenDecimal.gt(0),
    idealSubsidyAmountInOutputTokenDecimal,
    subsidyAmountInOutputTokenDecimal
  };
}

export function formatPartnerNote(ctx: QuoteContext, computation: DiscountComputation): string {
  const isCapped = computation.subsidyAmountInOutputTokenDecimal.lt(computation.idealSubsidyAmountInOutputTokenDecimal);
  return (
    `partner=${computation.partnerId || DEFAULT_PARTNER_NAME}, ` +
    `targetDiscount=${ctx.partner?.targetDiscount}, ` +
    `maxSubsidy=${ctx.partner?.maxSubsidy}, ` +
    `idealSubsidy=${computation.idealSubsidyAmountInOutputTokenDecimal.toString()}, ` +
    `actualSubsidy=${computation.subsidyAmountInOutputTokenDecimal.toString()}` +
    (isCapped ? " [CAPPED]" : "")
  );
}
