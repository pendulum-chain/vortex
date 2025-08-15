import crypto from "node:crypto";
import { RampDirection } from "@packages/shared";
import { config } from "../../../config/vars";
import { getJsonBody, getPath } from "./helpers";

const { priceProviders } = config;

/**
 * Generate API signature for AlchemyPay
 * @param timestamp The timestamp
 * @param method The HTTP method
 * @param requestUrl The request URL
 * @param body The request body
 * @param secretKey The secret key
 * @returns The API signature
 */
function apiSign(timestamp: string, method: string, requestUrl: string, body: string, secretKey: string): string {
  const content = timestamp + method.toUpperCase() + getPath(requestUrl) + getJsonBody(body);
  return crypto.createHmac("sha256", secretKey).update(content).digest("base64");
}

const PAYMENT_METHODS = {
  DEBIT_CARD: "10001"
} as const;

type RequestConfig = {
  requestUrl: string;
  request: RequestInit;
};

/**
 * Create a buy (onramp) quote request
 * @param cryptoCurrency The cryptocurrency code
 * @param fiat The fiat currency code
 * @param amount The amount to convert
 * @param network The blockchain network
 * @returns Request configuration
 */
function createBuyQuoteRequest(
  cryptoCurrency: string,
  fiat: string,
  amount: string,
  network: string,
  appId: string,
  secretKey: string,
  baseUrl: string
): RequestConfig {
  const httpMethod = "POST";
  const requestPath = "/open/api/v4/merchant/order/quote";
  const requestUrl = baseUrl + requestPath;
  const timestamp = String(Date.now());

  const requestBody: Record<string, string> = {
    amount,
    crypto: cryptoCurrency,
    fiat,
    network,
    payWayCode: PAYMENT_METHODS.DEBIT_CARD,
    side: "BUY"
  };

  const bodyString = JSON.stringify(requestBody);
  const sortedBody = getJsonBody(bodyString);

  const signature = apiSign(timestamp, httpMethod, requestUrl, sortedBody, secretKey.trim());

  const headers = {
    appId,
    "Content-Type": "application/json",
    sign: signature,
    timestamp
  } as const;

  return {
    request: {
      body: sortedBody,
      headers,
      method: httpMethod
    },
    requestUrl
  };
}

/**
 * Create a sell (offramp) quote request
 * @param cryptoCurrency The cryptocurrency code
 * @param fiat The fiat currency code
 * @param amount The amount to convert
 * @param network The blockchain network
 * @returns Request configuration
 */
function createSellQuoteRequest(
  cryptoCurrency: string,
  fiat: string,
  amount: string,
  network: string,
  appId: string,
  secretKey: string,
  baseUrl: string
): RequestConfig {
  const httpMethod = "POST";
  const requestPath = "/open/api/v4/merchant/order/quote";
  const requestUrl = baseUrl + requestPath;
  const timestamp = String(Date.now());

  const requestBody: Record<string, string> = {
    amount,
    crypto: cryptoCurrency,
    fiat,
    network,
    side: "SELL"
  };

  const bodyString = JSON.stringify(requestBody);
  const sortedBody = getJsonBody(bodyString);

  const signature = apiSign(timestamp, httpMethod, requestUrl, sortedBody, secretKey.trim());

  const headers = {
    appId,
    "Content-Type": "application/json",
    sign: signature,
    timestamp
  } as const;

  return {
    request: {
      body: sortedBody,
      headers,
      method: httpMethod
    },
    requestUrl
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
  network: string
): RequestConfig {
  const { secretKey, baseUrl, appId } = priceProviders.alchemyPay;
  if (!secretKey || !appId) throw new Error("AlchemyPay configuration missing");

  return direction === RampDirection.BUY
    ? createBuyQuoteRequest(cryptoCurrencyCode, fiatCurrencyCode, amount, network, appId, secretKey, baseUrl)
    : createSellQuoteRequest(cryptoCurrencyCode, fiatCurrencyCode, amount, network, appId, secretKey, baseUrl);
}
