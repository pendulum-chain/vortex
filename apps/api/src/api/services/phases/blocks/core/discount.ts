import { EvmToken, FiatToken, normalizeTokenSymbol, RampCurrency, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../../config/logger";
import { config } from "../../../../../config/vars";
import { findPartnerWithPricing, PartnerWithPricing } from "../../../partners/partner-pricing.service";
import { priceFeedService } from "../../../priceFeed.service";
import { QuoteContext } from "../../../quote/core/types";
import { getTargetFiatCurrency } from "./helpers";

export const DEFAULT_PARTNER_NAME = "vortex";

interface PartnerDiscountState {
  lastQuoteTimestamp: Date | null;
  difference: Big;
}

// Keyed per (partner, direction): pre-split the BUY/SELL partner rows had distinct ids and
// got per-direction state isolation for free — the composite key preserves that.
const partnerDiscountState = new Map<string, PartnerDiscountState>();

function getDeltaD(): Big {
  return new Big(config.quote.deltaDBasisPoints).div(10000);
}

function isWithinStateTimeout(timestamp: Date, now: Date): boolean {
  return now.getTime() - timestamp.getTime() < config.quote.discountStateTimeoutMinutes * 60 * 1000;
}

export type ActivePartner = {
  id: string;
  name: string;
  targetDiscount: number;
  maxSubsidy: number;
  minDynamicDifference: number;
  maxDynamicDifference: number;
  /** Discount-state map key, scoped per (partner, ramp direction, fiat corridor). */
  stateKey: string;
} | null;

export function toActivePartner(pricing: PartnerWithPricing): ActivePartner {
  return {
    id: pricing.id,
    maxDynamicDifference: pricing.maxDynamicDifference,
    maxSubsidy: pricing.maxSubsidy,
    minDynamicDifference: pricing.minDynamicDifference,
    name: pricing.name,
    stateKey: `${pricing.id}:${pricing.rampType}:${pricing.fiatCurrency ?? "*"}`,
    targetDiscount: pricing.targetDiscount
  };
}

export async function resolveActivePartnerById(
  partnerId: string,
  rampType: RampDirection,
  fiatCurrency: RampCurrency
): Promise<ActivePartner> {
  const pricing = await findPartnerWithPricing({ id: partnerId }, rampType, fiatCurrency);
  return pricing ? toActivePartner(pricing) : null;
}

export async function resolveDiscountPartner(
  ctx: Pick<QuoteContext, "partner" | "request">,
  rampType: RampDirection
): Promise<ActivePartner> {
  const partnerId = ctx.partner?.id;
  const fiatCurrency = getTargetFiatCurrency(rampType, ctx.request.inputCurrency, ctx.request.outputCurrency);

  if (partnerId) {
    const partner = await resolveActivePartnerById(partnerId, rampType, fiatCurrency);
    if (partner) {
      return partner;
    }
  }

  const vortexPricing = await findPartnerWithPricing({ name: DEFAULT_PARTNER_NAME }, rampType, fiatCurrency);
  return vortexPricing ? toActivePartner(vortexPricing) : null;
}

const USD_LIKE_INPUT_CURRENCIES: ReadonlySet<string> = new Set([
  "USD",
  EvmToken.USDC,
  EvmToken.USDT,
  EvmToken.USDCE,
  EvmToken.AXLUSDC
]);

const FIAT_PEG_BY_STABLECOIN: Record<string, FiatToken> = {
  [EvmToken.BRLA]: FiatToken.BRL,
  [EvmToken.EURC]: FiatToken.EURC
};

/**
 * Value the offramp request input in USD. The offramp expected-output math multiplies a
 * USD amount by the inverted FIAT-USD oracle rate, but request.inputAmount is denominated
 * in the input token: USD-like stables pass through unchanged, fiat-pegged stables
 * (BRLA, EURC) are valued at their peg's FIAT-USD oracle rate, and any other token falls
 * back to an independently computed bridged USDC amount when available. A raw non-USD
 * input is never relabeled as USD; inability to establish the denomination fails quote
 * creation.
 */
export async function getUsdDenominatedInputAmount(ctx: QuoteContext): Promise<Big> {
  const { inputAmount, inputCurrency } = ctx.request;
  const normalized = normalizeTokenSymbol(inputCurrency);

  if (USD_LIKE_INPUT_CURRENCIES.has(normalized)) {
    return new Big(inputAmount);
  }

  const pegFiat = FIAT_PEG_BY_STABLECOIN[normalized];
  if (pegFiat) {
    try {
      const fiatToUsdRate = await priceFeedService.getFiatToUsdExchangeRate(pegFiat);
      return new Big(inputAmount).mul(fiatToUsdRate);
    } catch (error) {
      const fallback = usdFallbackFromContext(ctx);
      logger.warn(
        `getUsdDenominatedInputAmount: ${pegFiat}-USD rate lookup failed for ${inputCurrency} input, ` +
          `falling back to ${fallback.toString()} USD. Error: ${error instanceof Error ? error.message : error}`
      );
      return fallback;
    }
  }

  return usdFallbackFromContext(ctx);
}

function usdFallbackFromContext(ctx: QuoteContext): Big {
  if (ctx.evmToEvm?.outputAmountDecimal) {
    return ctx.evmToEvm.outputAmountDecimal;
  }
  throw new Error(
    `Cannot value ${ctx.request.inputCurrency} input in USD: no fresh rate or independently derived USD route amount`
  );
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
  partner: ActivePartner
): { expectedOutput: Big; adjustedDifference: Big; adjustedTargetDiscount: Big } {
  const inputAmountBig = new Big(inputAmount);

  // For offramps, we need to invert the oracle price
  // Oracle price is FIAT-USD, so for offramps we want USD-FIAT
  const effectivePrice = isOfframp ? new Big(1).div(oraclePrice) : oraclePrice;
  const adjustedDifference = getAdjustedDifference(partner);
  // Apply target discount to the rate, adjusting first for dynamic discount variable.
  const adjustedTargetDiscount = new Big(targetDiscount).plus(adjustedDifference);
  const discountedRate = effectivePrice.mul(new Big(1).plus(adjustedTargetDiscount));

  return { adjustedDifference: adjustedDifference, adjustedTargetDiscount, expectedOutput: inputAmountBig.mul(discountedRate) };
}

/**
 * Whether a target discount is configured at all. Negative values are valid: they target
 * a rate worse than the reference rate while still subsidizing shortfalls up to it.
 * Sequelize returns DECIMAL pricing fields as strings at runtime, so compare via Big.
 */
export function hasConfiguredTargetDiscount(targetDiscount: number): boolean {
  return !new Big(targetDiscount ?? 0).eq(0);
}

// Clamp into [minDynamicDifference, maxDynamicDifference] using the partner's *current*
// config, so admin range changes apply to the very next quote instead of drifting there
// one deltaD step at a time. The max cap is applied last: if a misconfigured row has
// min > max, the cost ceiling wins.
function clampToDynamicRange(difference: Big, partner: NonNullable<ActivePartner>): Big {
  const minCap = new Big(partner.minDynamicDifference ?? 0);
  const maxCap = new Big(partner.maxDynamicDifference ?? 0);
  const floored = difference.lt(minCap) ? minCap : difference;
  return floored.gt(maxCap) ? maxCap : floored;
}

export function getAdjustedDifference(partner?: ActivePartner): Big {
  if (!partner?.id) {
    return new Big(0);
  }

  const partnerState = partnerDiscountState.get(partner.stateKey);
  const now = new Date();

  if (!partnerState) {
    const initialDifference = clampToDynamicRange(new Big(0), partner);
    partnerDiscountState.set(partner.stateKey, { difference: initialDifference, lastQuoteTimestamp: now });
    return initialDifference;
  }

  if (!partnerState.lastQuoteTimestamp) {
    const clampedDifference = clampToDynamicRange(partnerState.difference, partner);
    partnerDiscountState.set(partner.stateKey, { difference: clampedDifference, lastQuoteTimestamp: now });
    return clampedDifference;
  }

  const isYounger = isWithinStateTimeout(partnerState.lastQuoteTimestamp, now);

  if (!isYounger) {
    const clampedDifference = clampToDynamicRange(partnerState.difference.plus(getDeltaD()), partner);
    partnerDiscountState.set(partner.stateKey, { difference: clampedDifference, lastQuoteTimestamp: now });
    return clampedDifference;
  } else {
    const clampedDifference = clampToDynamicRange(partnerState.difference, partner);
    if (!clampedDifference.eq(partnerState.difference)) {
      partnerDiscountState.set(partner.stateKey, {
        difference: clampedDifference,
        lastQuoteTimestamp: partnerState.lastQuoteTimestamp
      });
    }
    return clampedDifference;
  }
}
export function handleQuoteConsumptionForDiscountState(partner?: ActivePartner): void {
  if (!partner?.id) {
    return;
  }

  const partnerState = partnerDiscountState.get(partner.stateKey);
  const now = new Date();

  if (!partnerState || !partnerState.lastQuoteTimestamp) {
    // This state should not exist. Only in case of server shut down and loss of state.
    return;
  }

  const isYounger = isWithinStateTimeout(partnerState.lastQuoteTimestamp, now);

  if (isYounger) {
    const clampedDifference = clampToDynamicRange(partnerState.difference.minus(getDeltaD()), partner);
    partnerDiscountState.set(partner.stateKey, { difference: clampedDifference, lastQuoteTimestamp: null });
  }
}

export function calculateSubsidyAmount(
  expectedOutput: Big,
  actualOutput: Big,
  maxSubsidy: number,
  capBasis: Big = expectedOutput
): Big {
  // If actual output is already >= expected, no subsidy needed
  if (actualOutput.gte(expectedOutput)) {
    return new Big(0);
  }

  if (maxSubsidy <= 0) {
    return new Big(0);
  }

  const shortfall = expectedOutput.minus(actualOutput);
  const maxAllowedSubsidy = capBasis.mul(maxSubsidy);
  return shortfall.gt(maxAllowedSubsidy) ? maxAllowedSubsidy : shortfall;
}
