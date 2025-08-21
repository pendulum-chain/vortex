import { MoonpayPriceResponse, RampDirection } from "@packages/shared";
import { config } from "../../../config";
import { ProviderInternalError } from "../../errors/providerErrors";
import { createQuoteRequest } from "./request-creator";
import { processMoonpayResponse } from "./response-handler";
import { getCryptoCode, getFiatCode } from "./utils";

const { priceProviders } = config;

export interface MoonpayResponse {
  baseCurrencyAmount: number;
  baseCurrencyPrice: number;
  quoteCurrencyAmount: number;
  feeAmount: number;
  message?: string;
  type?: string;
  baseCurrency: {
    minAmount: number;
    code: string;
  };
}

type FetchResult = {
  response: Response;
  body: MoonpayResponse;
};

type MoonpayError = {
  type: "NETWORK" | "PARSE";
  error: Error;
  response?: Response;
};

async function fetchMoonpayData(url: string): Promise<FetchResult> {
  try {
    const response = await fetch(url);
    const body = (await response.json()) as MoonpayResponse;
    return { body, response };
  } catch (error) {
    const moonpayError: MoonpayError = {
      error: error as Error,
      response: error instanceof TypeError ? undefined : (error as { response: Response }).response,
      type: error instanceof TypeError ? "NETWORK" : "PARSE"
    };

    console.error("Moonpay error:", moonpayError);

    throw new ProviderInternalError(
      moonpayError.type === "NETWORK"
        ? `Network error fetching price from Moonpay: ${moonpayError.error.message}`
        : `Failed to parse response from Moonpay (Status: ${moonpayError.response?.status}): ${moonpayError.response?.statusText}`
    );
  }
}

/**
 *  https://dev.moonpay.com/reference/getbuyquote
 *  https://dev.moonpay.com/reference/getsellquote
 */
async function priceQuery(
  cryptoCurrencyCode: string,
  fiatCurrencyCode: string,
  amount: string,
  extraFeePercentage: number,
  direction: RampDirection
): Promise<MoonpayPriceResponse> {
  const { baseUrl, apiKey } = priceProviders.moonpay;
  if (!apiKey) throw new Error("Moonpay API key not configured");

  const { requestPath: quoteRequestPath, params: quoteRequestParams } = createQuoteRequest(
    direction,
    cryptoCurrencyCode,
    fiatCurrencyCode,
    amount,
    extraFeePercentage
  );

  const url = `${baseUrl}${quoteRequestPath}?${quoteRequestParams.toString()}`;

  const { response, body } = await fetchMoonpayData(url);

  return processMoonpayResponse(response, body, amount, direction);
}

export const getPriceFor = (
  sourceCurrency: string,
  targetCurrency: string,
  amount: string,
  direction: RampDirection
): Promise<MoonpayPriceResponse> => {
  // We can specify a custom fee percentage here added on top of the Moonpay fee but we don't
  const extraFeePercentage = 0;

  const cryptoCurrency = direction === RampDirection.BUY ? targetCurrency : sourceCurrency;
  const fiatCurrency = direction === RampDirection.BUY ? sourceCurrency : targetCurrency;

  return priceQuery(getCryptoCode(cryptoCurrency), getFiatCode(fiatCurrency), amount, extraFeePercentage, direction);
};
