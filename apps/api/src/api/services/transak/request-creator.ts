import { Networks, RampDirection } from "@packages/shared";
import { config } from "../../../config";

/**
 * Payment method constants for Transak API
 */
const PAYMENT_METHODS = {
  CREDIT_CARD: "credit_debit_card"
} as const;

/**
 * Type definition for request configuration
 */
type RequestConfig = {
  requestPath: string;
  params: URLSearchParams;
};

/**
 * Create a buy (onramp) quote request
 * @param cryptoCurrencyCode The cryptocurrency code
 * @param fiatCurrencyCode The fiat currency code
 * @param fiatAmount The fiat amount to convert
 * @param network The blockchain network
 * @returns Request configuration
 */
function createBuyQuoteRequest(
  cryptoCurrencyCode: string,
  fiatCurrencyCode: string,
  fiatAmount: string,
  network: Networks
): RequestConfig {
  const requestPath = "/api/v1/pricing/public/quotes";

  const paramsObj: Record<string, string> = {
    cryptoCurrency: cryptoCurrencyCode,
    fiatAmount,
    fiatCurrency: fiatCurrencyCode,
    isBuyOrSell: "BUY",
    network: network.toLowerCase(),
    partnerApiKey: config.priceProviders.transak.partnerApiKey || "",
    paymentMethod: PAYMENT_METHODS.CREDIT_CARD
  };

  return {
    params: new URLSearchParams(paramsObj),
    requestPath
  };
}

/**
 * Create a sell (offramp) quote request
 * @param cryptoCurrencyCode The cryptocurrency code
 * @param fiatCurrencyCode The fiat currency code
 * @param cryptoAmount The crypto amount to convert
 * @param network The blockchain network
 * @returns Request configuration
 */
function createSellQuoteRequest(
  cryptoCurrencyCode: string,
  fiatCurrencyCode: string,
  cryptoAmount: string,
  network: Networks
): RequestConfig {
  const requestPath = "/api/v1/pricing/public/quotes";

  const paramsObj: Record<string, string> = {
    cryptoAmount,
    cryptoCurrency: cryptoCurrencyCode,
    fiatCurrency: fiatCurrencyCode,
    isBuyOrSell: "SELL",
    network: network.toLowerCase(),
    partnerApiKey: config.priceProviders.transak.partnerApiKey || ""
  };

  return {
    params: new URLSearchParams(paramsObj),
    requestPath
  };
}

/**
 * Create a quote request based on direction
 * @param direction The direction of the conversion (onramp or offramp)
 * @param cryptoCurrencyCode The cryptocurrency code
 * @param fiatCurrencyCode The fiat currency code
 * @param amount The amount to convert
 * @param network The blockchain network
 * @returns Request configuration
 */
export function createQuoteRequest(
  direction: RampDirection,
  cryptoCurrencyCode: string,
  fiatCurrencyCode: string,
  amount: string,
  network: Networks
): RequestConfig {
  return direction === RampDirection.BUY
    ? createBuyQuoteRequest(cryptoCurrencyCode, fiatCurrencyCode, amount, network)
    : createSellQuoteRequest(cryptoCurrencyCode, fiatCurrencyCode, amount, network);
}
