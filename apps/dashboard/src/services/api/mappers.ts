import type { CorridorId } from "@/domain/types";
import { EPaymentMethod, FiatToken, Networks, type PaymentMethod } from "./types";

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
