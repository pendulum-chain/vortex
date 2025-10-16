import { DestinationType, Networks, PaymentMethod, RampDirection } from "../index";

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
    throw new Error(
      `Unsupported country code: ${countryCode}. Supported codes: ${Object.keys(COUNTRY_TO_PAYMENT_METHOD).join(", ")}`
    );
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

/**
 * Extracts the payment method from the 'from' or 'to' destinations
 * @param from - Source destination
 * @param to - Target destination
 * @returns The payment method used in the transaction
 */
export function getPaymentMethodFromDestinations(from: DestinationType, to: DestinationType): PaymentMethod {
  // Check if 'from' is a payment method
  const paymentMethods: PaymentMethod[] = ["pix", "sepa", "cbu"];

  if (paymentMethods.includes(from as PaymentMethod)) {
    return from as PaymentMethod;
  }

  // Check if 'to' is a payment method
  if (paymentMethods.includes(to as PaymentMethod)) {
    return to as PaymentMethod;
  }

  throw new Error(`Unable to determine payment method from destinations: from=${from}, to=${to}`);
}
