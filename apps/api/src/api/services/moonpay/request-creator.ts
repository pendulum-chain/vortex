import { PriceEndpoints } from "shared";
import { config } from "../../../config";

const { priceProviders } = config;

const PAYMENT_METHODS = {
  PIX: "pix_instant_payment",
  CREDIT_CARD: "credit_debit_card",
  SEPA: "sepa_bank_transfer",
  ACH: "ach_bank_transfer",
  PAYPAL: "paypal",
} as const;

function createBuyQuoteRequest(
  cryptoCurrencyCode: string,
  fiatCurrencyCode: string,
  fiatAmount: string
): { requestPath: string; params: URLSearchParams } {
  const requestPath = `/v3/currencies/${cryptoCurrencyCode}/buy_quote`;

  const paymentMethod =
    fiatCurrencyCode.toLowerCase() === "brl"
      ? PAYMENT_METHODS.PIX
      : PAYMENT_METHODS.CREDIT_CARD;

  return {
    requestPath,
    params: new URLSearchParams({
      baseCurrencyCode: fiatCurrencyCode,
      baseCurrencyAmount: fiatAmount,
      paymentMethod,
      apiKey: priceProviders.moonpay.apiKey || "",
    }),
  };
}

function createSellQuoteRequest(
  cryptoCurrencyCode: string,
  fiatCurrencyCode: string,
  cryptoAmount: string,
  extraFeePercentage: number
): { requestPath: string; params: URLSearchParams } {
  const requestPath = `/v3/currencies/${cryptoCurrencyCode}/sell_quote`;

  const payoutMethod =
    fiatCurrencyCode.toLowerCase() === "eur"
      ? PAYMENT_METHODS.SEPA
      : PAYMENT_METHODS.CREDIT_CARD;

  return {
    requestPath,
    params: new URLSearchParams({
      apiKey: priceProviders.moonpay.apiKey || "",
      quoteCurrencyCode: fiatCurrencyCode,
      baseCurrencyAmount: cryptoAmount,
      extraFeePercentage: extraFeePercentage.toString(),
      payoutMethod,
    }),
  };
}

type RequestConfig = {
  requestPath: string;
  params: URLSearchParams;
};

export function createQuoteRequest(
  direction: PriceEndpoints.Direction,
  cryptoCurrencyCode: string,
  fiatCurrencyCode: string,
  amount: string,
  extraFeePercentage?: number
): RequestConfig {
  return direction === "onramp"
    ? createBuyQuoteRequest(cryptoCurrencyCode, fiatCurrencyCode, amount)
    : createSellQuoteRequest(
        cryptoCurrencyCode,
        fiatCurrencyCode,
        amount,
        extraFeePercentage ?? 0
      );
}
