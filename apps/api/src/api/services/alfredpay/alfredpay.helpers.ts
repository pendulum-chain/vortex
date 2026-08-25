import {
  ALFREDPAY_EVM_TOKEN,
  AlfredpayStablecoinKey,
  AmountLimits,
  DomesticCountry,
  DomesticCustomerType,
  FiatToken,
  getAnyFiatTokenDetails,
  isDomesticToken,
  RampCurrency,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import { Op } from "sequelize";
import sequelize from "../../../config/database";
import ProviderCustomer from "../../../models/providerCustomer.model";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";
import { getOrCreateCustomerEntityForProfile } from "../customer-entity.service";
import { multiplyByPowerOfTen } from "../pendulum/helpers";
import { AlfredpayLimitsService } from "./alfredpay-limits.service";

const FIAT_TO_COUNTRY: Partial<Record<FiatToken, DomesticCountry>> = {
  [FiatToken.ARS]: DomesticCountry.AR,
  [FiatToken.COP]: DomesticCountry.CO,
  [FiatToken.MXN]: DomesticCountry.MX,
  [FiatToken.USD]: DomesticCountry.US
};

const MONTHLY_USAGE_CACHE_TTL_MS = 60_000;
const monthlyUsageCache = new Map<string, { expiresAt: number; usage: Map<string, string> }>();

function usageKey(direction: RampDirection, fiat: FiatToken, stablecoin: AlfredpayStablecoinKey): string {
  return `${direction}:${fiat}:${stablecoin}`;
}

export function alfredpayCountryForFiat(fiat: FiatToken): DomesticCountry | undefined {
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
export async function lookupAlfredpayCustomerType(userId: string | undefined, fiat: FiatToken): Promise<DomesticCustomerType> {
  if (!userId) return DomesticCustomerType.INDIVIDUAL;
  const country = alfredpayCountryForFiat(fiat);
  if (!country) return DomesticCustomerType.INDIVIDUAL;
  const entity = await getOrCreateCustomerEntityForProfile(userId);
  // customer_type ASC keeps the legacy type-ASC precedence ('business' < 'individual').
  const customer = await ProviderCustomer.findOne({
    order: [["customerType", "ASC"]],
    where: { country, customerEntityId: entity.id, provider: "alfredpay" }
  });
  return customer?.customerType === "business" ? DomesticCustomerType.BUSINESS : DomesticCustomerType.INDIVIDUAL;
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
  customer: DomesticCustomerType;
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
  if (!isDomesticToken(fiatCandidate)) return null;

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

async function getReportedAlfredpayMonthlyUsageByFiat(userId: string): Promise<Map<string, string>> {
  const { startsAt, endsAt } = getCurrentUtcMonthPeriod();
  const cacheKey = `${userId}:${startsAt.toISOString()}`;
  const cached = monthlyUsageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.usage;

  const completionPeriod = sequelize.literal(`EXISTS (
    SELECT 1 FROM jsonb_array_elements("RampState"."phase_history") AS entry
    WHERE entry->>'phase' = 'complete'
      AND (entry->>'timestamp')::timestamptz >= ${sequelize.escape(startsAt)}
      AND (entry->>'timestamp')::timestamptz < ${sequelize.escape(endsAt)}
  )`);

  const completedRamps = (await RampState.findAll({
    include: [{ as: "quote", model: QuoteTicket, required: true, where: { status: "consumed" } }],
    where: {
      [Op.and]: completionPeriod,
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
      if (!fiat && isDomesticToken(quote.inputCurrency)) {
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

      if (!fiat && isDomesticToken(quote.outputCurrency)) {
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

/** Uncached usage used to enforce quote limits, preserving the original creation-time semantics. */
export async function getAlfredpayMonthlyUsageForEnforcement(
  userId: string,
  direction: RampDirection,
  fiat: FiatToken,
  stablecoin: AlfredpayStablecoinKey
): Promise<Big> {
  const isOnramp = direction === RampDirection.BUY;
  const fiatSide = isOnramp ? { inputCurrency: fiat } : { outputCurrency: fiat };
  const stablecoinSide = isOnramp ? { outputCurrency: stablecoin } : { inputCurrency: stablecoin };

  const completedRamps = (await RampState.findAll({
    include: [{ as: "quote", model: QuoteTicket, required: true, where: { ...fiatSide, ...stablecoinSide } }],
    where: {
      createdAt: { [Op.gte]: getCurrentUtcMonthPeriod().startsAt },
      currentPhase: "complete",
      type: direction,
      userId
    }
  })) as Array<RampState & { quote: QuoteTicket }>;

  let total = new Big(0);
  for (const ramp of completedRamps) total = total.plus(ramp.quote.inputAmount);
  return total;
}

/** Cached usage for informational reporting, grouped by provider-leg currency. */
export async function getReportedAlfredpayMonthlyUsage(
  userId: string,
  direction: RampDirection,
  fiat: FiatToken,
  stablecoin: AlfredpayStablecoinKey
): Promise<Big> {
  const usage = await getReportedAlfredpayMonthlyUsageByFiat(userId);
  return new Big(usage.get(usageKey(direction, fiat, stablecoin)) ?? 0);
}
