import { RampDirection } from "@packages/shared";
import { config } from "../../../config";

const { priceProviders } = config;

const PAYMENT_METHODS = {
  ACH: "ach_bank_transfer",
  CREDIT_CARD: "credit_debit_card",
  PAYPAL: "paypal",
  PIX: "pix_instant_payment",
  SEPA: "sepa_bank_transfer"
} as const;

function createBuyQuoteRequest(
  cryptoCurrencyCode: string,
  fiatCurrencyCode: string,
  fiatAmount: string
): { requestPath: string; params: URLSearchParams } {
  const requestPath = `/v3/currencies/${cryptoCurrencyCode}/buy_quote`;

  const paymentMethod = fiatCurrencyCode.toLowerCase() === "brl" ? PAYMENT_METHODS.PIX : PAYMENT_METHODS.CREDIT_CARD;

  return {
    params: new URLSearchParams({
      apiKey: priceProviders.moonpay.apiKey || "",
      baseCurrencyAmount: fiatAmount,
      baseCurrencyCode: fiatCurrencyCode,
      paymentMethod
    }),
    requestPath
  };
}

function createSellQuoteRequest(
  cryptoCurrencyCode: string,
  fiatCurrencyCode: string,
  cryptoAmount: string,
  extraFeePercentage: number
): { requestPath: string; params: URLSearchParams } {
  const requestPath = `/v3/currencies/${cryptoCurrencyCode}/sell_quote`;

  const payoutMethod = fiatCurrencyCode.toLowerCase() === "eur" ? PAYMENT_METHODS.SEPA : PAYMENT_METHODS.CREDIT_CARD;

  return {
    params: new URLSearchParams({
      apiKey: priceProviders.moonpay.apiKey || "",
      baseCurrencyAmount: cryptoAmount,
      extraFeePercentage: extraFeePercentage.toString(),
      payoutMethod,
      quoteCurrencyCode: fiatCurrencyCode
    }),
    requestPath
  };
}

type RequestConfig = {
  requestPath: string;
  params: URLSearchParams;
};

export function createQuoteRequest(
  direction: RampDirection,
  cryptoCurrencyCode: string,
  fiatCurrencyCode: string,
  amount: string,
  extraFeePercentage?: number
): RequestConfig {
  return direction === RampDirection.BUY
    ? createBuyQuoteRequest(cryptoCurrencyCode, fiatCurrencyCode, amount)
    : createSellQuoteRequest(cryptoCurrencyCode, fiatCurrencyCode, amount, extraFeePercentage ?? 0);
}
