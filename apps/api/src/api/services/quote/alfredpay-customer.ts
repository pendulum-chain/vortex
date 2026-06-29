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
  "Alfredpay quote creation requires an API key linked to a user or Supabase user authentication.";

export function requireAlfredpayEffectiveUserId(userId: string | undefined | null): string {
  if (!userId) {
    throw new APIError({
      message: ALFREDPAY_EFFECTIVE_USER_REQUIRED_MESSAGE,
      status: httpStatus.BAD_REQUEST
    });
  }

  return userId;
}

/**
 * Resolve the AlfredPay customer id for a given fiat currency + user. The
 * fiat side of the request determines the country; the user must own a
 * KYC-completed (`Success`) customer row.
 *
 * Ramp-register / start enforce a non-empty `userId` for every corridor.
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
      message: `No completed Alfredpay KYC profile found for ${fiatCurrency}. Complete Alfredpay KYC before requesting a quote.`,
      status: httpStatus.BAD_REQUEST
    });
  }

  if (customer.status !== AlfredPayStatus.Success) {
    throw new APIError({
      message: `Alfredpay KYC status is ${customer.status}. Complete Alfredpay KYC before requesting a quote.`,
      status: httpStatus.BAD_REQUEST
    });
  }

  return customer.alfredPayId;
}
