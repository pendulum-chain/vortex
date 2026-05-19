import {
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
import AlfredPayCustomer from "../../../models/alfredPayCustomer.model";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";
import { multiplyByPowerOfTen } from "../pendulum/helpers";
import { AlfredpayLimitsService } from "./alfredpay-limits.service";

const FIAT_TO_COUNTRY: Partial<Record<FiatToken, AlfredPayCountry>> = {
  [FiatToken.COP]: AlfredPayCountry.CO,
  [FiatToken.MXN]: AlfredPayCountry.MX,
  [FiatToken.USD]: AlfredPayCountry.US
};

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
  const customer = await AlfredPayCustomer.findOne({ where: { country, userId } });
  return customer?.type === AlfredpayCustomerType.BUSINESS ? AlfredpayCustomerType.BUSINESS : AlfredpayCustomerType.INDIVIDUAL;
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
 * Throws when the on-chain side isn't a recognized AlfredPay stablecoin.
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
  const onchainCurrency = isOnramp ? outputCurrency : inputCurrency;
  if (!isAlfredpayToken(fiatCandidate)) return null;

  const stablecoin = stablecoinFromCurrency(onchainCurrency);
  if (!stablecoin) {
    throw new Error(`Unsupported AlfredPay stablecoin: ${onchainCurrency}`);
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

function startOfCurrentUtcMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Returned in input-currency human units: fiat on onramp, stablecoin on offramp. */
export async function getAlfredpayMonthlyUsage(userId: string, direction: RampDirection, fiat: FiatToken): Promise<Big> {
  const isOnramp = direction === RampDirection.BUY;
  const fiatSide = isOnramp ? { inputCurrency: fiat } : { outputCurrency: fiat };

  const completedRamps = (await RampState.findAll({
    include: [{ as: "quote", model: QuoteTicket, required: true, where: fiatSide }],
    where: {
      createdAt: { [Op.gte]: startOfCurrentUtcMonth() },
      currentPhase: "complete",
      type: direction,
      userId
    }
  })) as Array<RampState & { quote: QuoteTicket }>;

  let total = new Big(0);
  for (const ramp of completedRamps) {
    total = total.plus(ramp.quote.inputAmount);
  }
  return total;
}
