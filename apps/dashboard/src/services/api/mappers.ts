import { EPaymentMethod, FiatToken, Networks, type PaymentMethod } from "@vortexfi/shared";
import type { CorridorId } from "@/domain/types";

/** Dashboard corridor → wire FiatToken (note EURC → "EUR"). */
export const CORRIDOR_FIAT: Record<CorridorId, FiatToken> = {
  AR: FiatToken.ARS,
  BR: FiatToken.BRL,
  CO: FiatToken.COP,
  EU: FiatToken.EURC,
  MX: FiatToken.MXN,
  US: FiatToken.USD
};

/** Dashboard corridor → wire PaymentMethod. */
export const CORRIDOR_PAYMENT_METHOD: Record<CorridorId, PaymentMethod> = {
  AR: EPaymentMethod.CBU,
  BR: EPaymentMethod.PIX,
  CO: EPaymentMethod.ACH,
  EU: EPaymentMethod.SEPA,
  MX: EPaymentMethod.SPEI,
  US: EPaymentMethod.ACH
};

/** ISO country code for the CreateQuoteRequest.countryCode field. */
export const CORRIDOR_COUNTRY: Record<CorridorId, string> = {
  AR: "AR",
  BR: "BR",
  CO: "CO",
  EU: "DE",
  MX: "MX",
  US: "US"
};

/**
 * Dashboard corridor → payout rail as the recipient backend expects it (the lowercased
 * currency code). `providerForRail` routes eur→mykobo, brl→avenia, everything else→alfredpay.
 */
export const CORRIDOR_RAIL: Record<CorridorId, string> = {
  AR: "ars",
  BR: "brl",
  CO: "cop",
  EU: "eur",
  MX: "mxn",
  US: "usd"
};

/** Inverse of CORRIDOR_RAIL — maps a fetched recipient's rail back to its corridor. */
export const CORRIDOR_BY_RAIL: Record<string, CorridorId> = Object.fromEntries(
  Object.entries(CORRIDOR_RAIL).map(([corridorId, rail]) => [rail, corridorId as CorridorId])
) as Record<string, CorridorId>;

/** AlfredPay corridors expose a fetchable list of saved fiat (payout) accounts. */
export const ALFREDPAY_CORRIDORS: CorridorId[] = ["US", "MX", "CO", "AR"];

/** Inverse of CORRIDOR_FIAT — maps a ramp-history payout currency back to its corridor. */
export const CORRIDOR_BY_FIAT: Partial<Record<FiatToken, CorridorId>> = Object.fromEntries(
  Object.entries(CORRIDOR_FIAT).map(([corridorId, fiat]) => [fiat, corridorId as CorridorId])
) as Partial<Record<FiatToken, CorridorId>>;

/**
 * Region code for the widget's KYB deep link (`?kybLocked=`). Mirrors `KYB_REGIONS` in
 * `apps/frontend/src/constants/kybRegions.ts`. EU is the only corridor missing: it is
 * individual KYC only and needs a connected wallet, so it cannot complete a quote-less
 * KYB deep link and falls back to the widget home.
 */
export const CORRIDOR_KYB_REGION: Partial<Record<CorridorId, string>> = {
  AR: "AR",
  BR: "BR",
  CO: "CO",
  EU: "EU",
  MX: "MX",
  US: "US"
};

/** Min/max payout limits per corridor, in units of the corridor's fiat currency. */
export const CORRIDOR_LIMITS: Record<CorridorId, { min: number; max: number }> = {
  AR: { max: 9_000_000, min: 9_500 },
  BR: { max: 50_000, min: 55 },
  CO: { max: 40_000_000, min: 40_000 },
  EU: { max: 10_000, min: 10 },
  MX: { max: 180_000, min: 185 },
  US: { max: 10_000, min: 10 }
};

/** Dashboard transfer-network id → wire Networks (values already match). */
export function toWireNetwork(networkId: string): Networks {
  return networkId as Networks;
}
