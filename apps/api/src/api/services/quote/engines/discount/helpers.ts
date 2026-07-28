import { EvmToken, FiatToken, normalizeTokenSymbol, RampCurrency, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../../config/logger";
import { config } from "../../../../../config/vars";
import { findPartnerWithPricing, PartnerWithPricing } from "../../../partners/partner-pricing.service";
import { priceFeedService } from "../../../priceFeed.service";
import { getTargetFiatCurrency } from "../../core/helpers";
import { QuoteContext } from "../../core/types";
import { DiscountComputation } from "./index";

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

export interface DiscountSubsidyPayload {
  actualOutputAmountDecimal: Big;
  actualOutputAmountRaw: string;
  expectedOutputAmountDecimal: Big;
}

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

export async function resolveDiscountPartner(ctx: QuoteContext, rampType: RampDirection): Promise<ActivePartner> {
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
 * back to the bridged USDC amount when available.
 *
 * A rate-feed failure while valuing a fiat-pegged stable MUST NOT fail the quote: the
 * engine already holds the bridged USDC amount, a good USD-denominated proxy, so we fall
 * back to it (or the raw input as a last resort) rather than throwing from discount math.
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
  return new Big(ctx.request.inputAmount);
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

export function getAdjustedDifference(partner?: ActivePartner): Big {
  if (!partner?.id) {
    return new Big(0);
  }

  const partnerState = partnerDiscountState.get(partner.stateKey);
  const now = new Date();

  // Use partner's max caps if available, otherwise fall back to targetDiscount
  const maxCap = partner.maxDynamicDifference ?? 0;

  if (!partnerState) {
    partnerDiscountState.set(partner.stateKey, { difference: new Big(0), lastQuoteTimestamp: now });
    return new Big(0);
  }

  if (!partnerState.lastQuoteTimestamp) {
    partnerDiscountState.set(partner.stateKey, { difference: partnerState.difference, lastQuoteTimestamp: now });
    return partnerState.difference;
  }

  const isYounger = isWithinStateTimeout(partnerState.lastQuoteTimestamp, now);

  if (!isYounger) {
    const updatedDifference = partnerState.difference.plus(getDeltaD());
    const clampedDifference = updatedDifference.gt(maxCap) ? Big(maxCap) : updatedDifference;
    partnerDiscountState.set(partner.stateKey, { difference: clampedDifference, lastQuoteTimestamp: now });
    return clampedDifference;
  } else {
    // Return existing difference
    return partnerState.difference;
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
    // Use partner's min caps if available, otherwise fall back to targetDiscount
    const minCap = partner.minDynamicDifference ?? 0;

    const updatedDifference = partnerState.difference.minus(getDeltaD());
    const clampedDifference = updatedDifference.lt(minCap) ? Big(minCap) : updatedDifference;
    partnerDiscountState.set(partner.stateKey, { difference: clampedDifference, lastQuoteTimestamp: null });
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
