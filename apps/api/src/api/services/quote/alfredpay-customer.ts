import { AlfredPayCountry, AlfredPayStatus, FiatToken, isAlfredpayToken } from "@vortexfi/shared";
import httpStatus from "http-status";
import AlfredPayCustomer from "../../../models/alfredPayCustomer.model";
import { APIError } from "../../errors/api-error";

const fiatToCountry: Partial<Record<FiatToken, AlfredPayCountry>> = {
  [FiatToken.USD]: AlfredPayCountry.US,
  [FiatToken.MXN]: AlfredPayCountry.MX,
  [FiatToken.COP]: AlfredPayCountry.CO,
  [FiatToken.ARS]: AlfredPayCountry.AR
};

export const ALFREDPAY_EFFECTIVE_USER_REQUIRED_MESSAGE =
  "This endpoint requires an API key linked to a user or Supabase user authentication.";

/**
 * Sentinel customer id used in the tracking-only `metadata.customerId` field of Alfredpay
 * *quote* requests when no KYC-completed customer can be resolved (anonymous rate discovery).
 * Alfredpay only validates the top-level `customerId` on order creation, which always goes
 * through the strict `resolveAlfredpayCustomerId`.
 */
export const ALFREDPAY_ANONYMOUS_CUSTOMER_ID = "anonymous";

/**
 * Best-effort customer id for Alfredpay *quote* metadata. Returns the user's KYC-completed
 * customer id when resolvable, otherwise the anonymous sentinel. Never throws for a missing
 * user or missing/incomplete KYC — quotes stay anonymous-eligible; registration enforces KYC.
 */
export async function resolveAlfredpayQuoteCustomerId(fiatCurrency: string, userId: string | undefined): Promise<string> {
  if (!userId) {
    return ALFREDPAY_ANONYMOUS_CUSTOMER_ID;
  }

  const country = fiatToCountry[fiatCurrency as FiatToken];
  if (!country) {
    return ALFREDPAY_ANONYMOUS_CUSTOMER_ID;
  }

  const customer = await AlfredPayCustomer.findOne({
    where: { country, userId }
  });

  if (!customer || customer.status !== AlfredPayStatus.Success) {
    return ALFREDPAY_ANONYMOUS_CUSTOMER_ID;
  }

  return customer.alfredPayId;
}

/**
 * Resolve the AlfredPay customer id for a given fiat currency + user. The
 * fiat side of the request determines the country; the user must own a
 * KYC-completed (`Success`) customer row.
 *
 * Used on the register/start paths, which enforce a non-empty `userId` for
 * every corridor. Quote creation uses `resolveAlfredpayQuoteCustomerId` instead.
 */
export async function resolveAlfredpayCustomerId(fiatCurrency: string, userId: string): Promise<string> {
  if (!isAlfredpayToken(fiatCurrency as FiatToken)) {
    throw new APIError({
      message: `Unsupported Alfredpay currency: ${fiatCurrency}`,
      status: httpStatus.BAD_REQUEST
    });
  }

  const country = fiatToCountry[fiatCurrency as FiatToken];
  if (!country) {
    throw new APIError({
      message: `Unsupported Alfredpay currency: ${fiatCurrency}`,
      status: httpStatus.BAD_REQUEST
    });
  }

  const customer = await AlfredPayCustomer.findOne({
    where: { country, userId }
  });

  if (!customer) {
    throw new APIError({
      message: `No completed Alfredpay KYC profile found for ${fiatCurrency}. Complete Alfredpay KYC before registering a ramp.`,
      status: httpStatus.BAD_REQUEST
    });
  }

  if (customer.status !== AlfredPayStatus.Success) {
    throw new APIError({
      message: `Alfredpay KYC status is ${customer.status}. Complete Alfredpay KYC before registering a ramp.`,
      status: httpStatus.BAD_REQUEST
    });
  }

  return customer.alfredPayId;
}
