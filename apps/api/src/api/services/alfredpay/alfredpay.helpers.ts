import {
  AlfredPayCountry,
  AlfredpayCustomerKey,
  AlfredpayCustomerType,
  AlfredpayStablecoinKey,
  FiatToken,
  getAnyFiatTokenDetails,
  isAlfredpayToken,
  RampCurrency,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import AlfredPayCustomer from "../../../models/alfredPayCustomer.model";
import { multiplyByPowerOfTen } from "../pendulum/helpers";
import { AlfredpayLimitsDirection, AlfredpayLimitsService, normalizeCustomerType } from "./alfredpay-limits.service";

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
export async function lookupAlfredpayCustomerType(
  userId: string | undefined,
  fiat: FiatToken
): Promise<"INDIVIDUAL" | "BUSINESS"> {
  if (!userId) return "INDIVIDUAL";
  const country = alfredpayCountryForFiat(fiat);
  if (!country) return "INDIVIDUAL";
  const customer = await AlfredPayCustomer.findOne({ where: { country, userId } });
  return normalizeCustomerType(customer?.type as AlfredpayCustomerType | undefined);
}

/**
 * Resolves the stablecoin axis (USDC vs USDT) from the on-chain currency in a quote request.
 * Returns null if the currency isn't a recognized AlfredPay stablecoin.
 */
export function stablecoinFromCurrency(currency: RampCurrency): AlfredpayStablecoinKey | null {
  const symbol = String(currency);
  if (symbol === "USDC" || symbol === "USDT") return symbol;
  return null;
}

export interface AlfredpayQuoteLimitsContext {
  fiat: FiatToken;
  stablecoin: AlfredpayStablecoinKey;
  customerType: AlfredpayCustomerKey;
  direction: AlfredpayLimitsDirection;
  /** Limits expressed in human units of `inputCurrency` (the side the validator checks). */
  inputLimits: { min: string; max: string };
}

/**
 * Resolves AlfredPay limits for a quote request, returning null when the quote isn't an AlfredPay quote.
 * Throws when the on-chain side isn't a recognized AlfredPay stablecoin.
 */
export async function resolveAlfredpayQuoteLimits(args: {
  rampType: RampDirection;
  inputCurrency: RampCurrency;
  outputCurrency: RampCurrency;
  userId?: string;
}): Promise<AlfredpayQuoteLimitsContext | null> {
  const { rampType, inputCurrency, outputCurrency, userId } = args;
  const direction: AlfredpayLimitsDirection = rampType === RampDirection.BUY ? "onramp" : "offramp";
  const fiatCandidate = (direction === "onramp" ? inputCurrency : outputCurrency) as FiatToken;
  if (!isAlfredpayToken(fiatCandidate)) return null;

  const stablecoin = stablecoinFromCurrency(direction === "onramp" ? outputCurrency : inputCurrency);
  if (!stablecoin) {
    throw new Error(
      `Unsupported AlfredPay ${direction} stablecoin: ${direction === "onramp" ? outputCurrency : inputCurrency}`
    );
  }

  const customerType = await lookupAlfredpayCustomerType(userId, fiatCandidate);
  const bucket = AlfredpayLimitsService.getInstance().getLimits(fiatCandidate, stablecoin, customerType, direction);
  const decimals = direction === "onramp" ? getAnyFiatTokenDetails(fiatCandidate).decimals : 6;

  return {
    customerType,
    direction,
    fiat: fiatCandidate,
    inputLimits: {
      max: multiplyByPowerOfTen(new Big(bucket.maxRaw), -decimals).toFixed(),
      min: multiplyByPowerOfTen(new Big(bucket.minRaw), -decimals).toFixed()
    },
    stablecoin
  };
}
