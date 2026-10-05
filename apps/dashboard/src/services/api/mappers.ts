import { CORRIDOR_CAPABILITIES, EPaymentMethod, type PaymentMethod } from "@vortexfi/shared";
import type { CorridorId } from "@/domain/types";

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
 * Maps a fetched recipient's payout rail (the lowercased currency code the recipient backend uses;
 * `providerForRail` routes eur→monerium, brl→avenia, everything else→alfredpay) back to its corridor.
 */
export const CORRIDOR_BY_RAIL: Record<string, CorridorId> = Object.fromEntries(
  Object.entries(CORRIDOR_CAPABILITIES).map(([corridorId, { rail }]) => [rail, corridorId as CorridorId])
) as Record<string, CorridorId>;

/** AlfredPay corridors expose a fetchable list of saved fiat (payout) accounts. */
export const ALFREDPAY_CORRIDORS: CorridorId[] = ["US", "MX", "CO", "AR"];
