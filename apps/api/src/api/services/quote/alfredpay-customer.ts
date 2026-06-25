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

/**
 * Sentinel `quoteId` value used by the Alfredpay quote engines when the quote
 * was created without an authenticated user (anonymous quote). Real Alfredpay
 * quote creation requires a KYC-completed customer id, so anonymous quotes
 * cannot mint a real upstream `quoteId` here.
 */
export const ANONYMOUS_ALFREDPAY_QUOTE_ID = "__anonymous_alfredpay_quote__";

export function isAnonymousAlfredpayQuoteId(quoteId: string | undefined | null): boolean {
  return quoteId === ANONYMOUS_ALFREDPAY_QUOTE_ID;
}

/**
 * Resolve the AlfredPay customer id for a given fiat currency + user. The
 * fiat side of the request determines the country; the user must own a
 * KYC-completed (`Success`) customer row.
 *
 * Ramp-register / start enforce a non-empty `userId` for provider-backed
 * flows (Alfredpay, Avenia/BRL).
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
