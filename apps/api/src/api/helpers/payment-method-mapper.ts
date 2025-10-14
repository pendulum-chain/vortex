import { DestinationType, Networks, PaymentMethod, RampDirection } from "@packages/shared";
import httpStatus from "http-status";
import { APIError } from "../errors/api-error";

const COUNTRY_TO_PAYMENT_METHOD: Record<string, PaymentMethod> = {
  AR: "cbu",
  BR: "pix",
  EU: "sepa"
};

/**
 * Derives the 'from' and 'to' destinations based on country code, network, and ramp type
 * @param countryCode - ISO country code (e.g., 'BR', 'AR', 'EU')
 * @param network - Target blockchain network
 * @param rampType - Direction of the ramp (BUY or SELL)
 * @returns Object containing 'from' and 'to' destinations
 */
export function deriveFromTo(
  countryCode: string,
  network: Networks,
  rampType: RampDirection
): { from: DestinationType; to: DestinationType } {
  const normalizedCountryCode = countryCode.toUpperCase();
  const paymentMethod = COUNTRY_TO_PAYMENT_METHOD[normalizedCountryCode];

  if (!paymentMethod) {
    throw new APIError({
      message: `Unsupported country code: ${countryCode}. Supported codes: ${Object.keys(COUNTRY_TO_PAYMENT_METHOD).join(", ")}`,
      status: httpStatus.BAD_REQUEST
    });
  }

  if (rampType === RampDirection.BUY) {
    return {
      from: paymentMethod,
      to: network
    };
  } else {
    return {
      from: network,
      to: paymentMethod
    };
  }
}
