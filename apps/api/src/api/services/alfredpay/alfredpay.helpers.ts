import {
  ALFREDPAY_EVM_TOKEN,
  AlfredPayCountry,
  AlfredpayCustomerType,
  AlfredpayStablecoinKey,
  AmountLimits,
  FiatToken,
  getAnyFiatTokenDetails,
  isAlfredpayToken,
  RampCurrency,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import { Op } from "sequelize";
import ProviderCustomer from "../../../models/providerCustomer.model";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";
import { getOrCreateCustomerEntityForProfile } from "../customer-entity.service";
import { multiplyByPowerOfTen } from "../pendulum/helpers";
import { AlfredpayLimitsService } from "./alfredpay-limits.service";

const FIAT_TO_COUNTRY: Partial<Record<FiatToken, AlfredPayCountry>> = {
  [FiatToken.ARS]: AlfredPayCountry.AR,
  [FiatToken.COP]: AlfredPayCountry.CO,
  [FiatToken.MXN]: AlfredPayCountry.MX,
  [FiatToken.USD]: AlfredPayCountry.US
};

const MONTHLY_USAGE_CACHE_TTL_MS = 60_000;
const monthlyUsageCache = new Map<string, { expiresAt: number; usage: Map<string, string> }>();

function usageKey(direction: RampDirection, fiat: FiatToken, stablecoin: AlfredpayStablecoinKey): string {
  return `${direction}:${fiat}:${stablecoin}`;
}

export function alfredpayCountryForFiat(fiat: FiatToken): AlfredPayCountry | undefined {
  return FIAT_TO_COUNTRY[fiat];
}

/**
 * Returns the AlfredPay customer type for a user+country, defaulting to INDIVIDUAL when:
 * - no userId is available (unauthenticated quote)
 * - the user has no alfredpay_customer row for that country (KYC not started)
 *
 * Defaulting to INDIVIDUAL is intentional — it's the more restrictive bucket on USD/COP, so an
 * anonymous quote that would later route through a Business customer just sees tighter limits at first.
 */
export async function lookupAlfredpayCustomerType(userId: string | undefined, fiat: FiatToken): Promise<AlfredpayCustomerType> {
  if (!userId) return AlfredpayCustomerType.INDIVIDUAL;
  const country = alfredpayCountryForFiat(fiat);
  if (!country) return AlfredpayCustomerType.INDIVIDUAL;
  const entity = await getOrCreateCustomerEntityForProfile(userId);
  // customer_type ASC keeps the legacy type-ASC precedence ('business' < 'individual').
  const customer = await ProviderCustomer.findOne({
    order: [["customerType", "ASC"]],
    where: { country, customerEntityId: entity.id, provider: "alfredpay" }
  });
  return customer?.customerType === "business" ? AlfredpayCustomerType.BUSINESS : AlfredpayCustomerType.INDIVIDUAL;
}

/**
 * Resolves the stablecoin axis (USDC vs USDT) from the on-chain currency in a quote request.
 * Returns null if the currency isn't a recognized AlfredPay stablecoin.
 */
export function stablecoinFromCurrency(currency: RampCurrency): AlfredpayStablecoinKey | null {
  return currency === "USDC" || currency === "USDT" ? currency : null;
}

/** AlfredPay limits resolved for a specific quote — includes the axes used to pick them. */
export interface ResolvedAlfredpayLimits extends AmountLimits {
  fiat: FiatToken;
  stablecoin: AlfredpayStablecoinKey;
  customer: AlfredpayCustomerType;
  direction: RampDirection;
}

/**
 * Resolves AlfredPay limits for a quote request, returning null when the quote isn't an AlfredPay quote.
 *
 * Returned limits are in human units of `inputCurrency` (the side the validator checks).
 */
export async function resolveAlfredpayQuoteLimits(args: {
  rampType: RampDirection;
  inputCurrency: RampCurrency;
  outputCurrency: RampCurrency;
  userId?: string;
}): Promise<ResolvedAlfredpayLimits | null> {
  const { rampType, inputCurrency, outputCurrency, userId } = args;
  const isOnramp = rampType === RampDirection.BUY;
  const fiatCandidate = isOnramp ? inputCurrency : outputCurrency;
  if (!isAlfredpayToken(fiatCandidate)) return null;

  // Routed quotes may end in another asset; AlfredPay always settles the anchor leg in this token.
  const stablecoin = stablecoinFromCurrency(ALFREDPAY_EVM_TOKEN);
  if (!stablecoin) {
    throw new Error(`Unsupported AlfredPay stablecoin: ${ALFREDPAY_EVM_TOKEN}`);
  }

  const customer = await lookupAlfredpayCustomerType(userId, fiatCandidate);
  const raw = AlfredpayLimitsService.getInstance().getLimits(fiatCandidate, stablecoin, customer, rampType);
  const decimals = isOnramp ? getAnyFiatTokenDetails(fiatCandidate).decimals : 6;

  return {
    customer,
    direction: rampType,
    fiat: fiatCandidate,
    max: multiplyByPowerOfTen(new Big(raw.maxRaw), -decimals).toFixed(),
    min: multiplyByPowerOfTen(new Big(raw.minRaw), -decimals).toFixed(),
    stablecoin
  };
}

export function getCurrentUtcMonthPeriod(now = new Date()): { startsAt: Date; endsAt: Date } {
  return {
    endsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    startsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  };
}

export function clearAlfredpayMonthlyUsageCache(): void {
  monthlyUsageCache.clear();
}

async function getAlfredpayMonthlyUsageByFiat(userId: string): Promise<Map<string, string>> {
  const { startsAt, endsAt } = getCurrentUtcMonthPeriod();
  const cacheKey = `${userId}:${startsAt.toISOString()}`;
  const cached = monthlyUsageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.usage;

  const completedRamps = (await RampState.findAll({
    include: [{ as: "quote", model: QuoteTicket, required: true, where: { status: "consumed" } }],
    where: {
      createdAt: { [Op.gte]: startsAt, [Op.lt]: endsAt },
      currentPhase: "complete",
      userId
    }
  })) as Array<RampState & { quote: QuoteTicket }>;

  const usage = new Map<string, string>();
  for (const ramp of completedRamps) {
    const quote = ramp.quote;
    const blocks = (quote.metadata as { blocks?: Record<string, unknown> } | null)?.blocks;
    let fiat: FiatToken | undefined;
    let stablecoin: AlfredpayStablecoinKey | null = null;
    let amount: unknown;

    if (ramp.type === RampDirection.BUY) {
      const block = blocks?.alfredpayMint as { currency?: FiatToken; inputAmountDecimal?: unknown } | undefined;
      fiat = block?.currency;
      stablecoin = stablecoinFromCurrency(ALFREDPAY_EVM_TOKEN);
      amount = block?.inputAmountDecimal;

      // Quotes persisted before block metadata was introduced can only be identified by their direct pair.
      if (!fiat && isAlfredpayToken(quote.inputCurrency)) {
        const legacyStablecoin = stablecoinFromCurrency(quote.outputCurrency);
        if (legacyStablecoin) {
          fiat = quote.inputCurrency;
          stablecoin = legacyStablecoin;
          amount = quote.inputAmount;
        }
      }
    } else {
      const block = blocks?.alfredpayOfframp as
        | { currency?: FiatToken; inputAmountDecimal?: unknown; token?: RampCurrency }
        | undefined;
      fiat = block?.currency;
      stablecoin = block?.token ? stablecoinFromCurrency(block.token) : null;
      amount = block?.inputAmountDecimal;

      if (!fiat && isAlfredpayToken(quote.outputCurrency)) {
        const legacyStablecoin = stablecoinFromCurrency(quote.inputCurrency);
        if (legacyStablecoin) {
          fiat = quote.outputCurrency;
          stablecoin = legacyStablecoin;
          amount = quote.inputAmount;
        }
      }
    }

    if (!fiat || !stablecoin || amount === undefined) continue;
    const key = usageKey(ramp.type, fiat, stablecoin);
    usage.set(key, new Big(usage.get(key) ?? 0).plus(String(amount)).toFixed());
  }

  if (monthlyUsageCache.size > 10_000) monthlyUsageCache.clear();
  monthlyUsageCache.set(cacheKey, { expiresAt: Date.now() + MONTHLY_USAGE_CACHE_TTL_MS, usage });
  return usage;
}

/** Returned in input-currency human units: fiat on onramp, stablecoin on offramp. */
export async function getAlfredpayMonthlyUsage(
  userId: string,
  direction: RampDirection,
  fiat: FiatToken,
  stablecoin: AlfredpayStablecoinKey
): Promise<Big> {
  const usage = await getAlfredpayMonthlyUsageByFiat(userId);
  return new Big(usage.get(usageKey(direction, fiat, stablecoin)) ?? 0);
}
