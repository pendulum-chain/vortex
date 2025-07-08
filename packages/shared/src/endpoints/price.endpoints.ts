import { EvmToken } from "../tokens";

// GET /prices?provider=:provider&sourceCurrency=:sourceCurrency&targetCurrency=:targetCurrency&amount=:amount&network=:network&direction=:direction
export const VALID_PROVIDERS = ["alchemypay", "moonpay", "transak"] as const;
export const VALID_CRYPTO_CURRENCIES = Object.values(EvmToken);
export const VALID_FIAT_CURRENCIES = ["eur", "ars", "brl"] as const;

export type PriceProvider = (typeof VALID_PROVIDERS)[number];
export type CryptoCurrency = (typeof VALID_CRYPTO_CURRENCIES)[number];
export type FiatCurrency = (typeof VALID_FIAT_CURRENCIES)[number];
export type Currency = CryptoCurrency | FiatCurrency;

// Validation functions
export const isValidPriceProvider = (value: unknown): value is PriceProvider =>
  typeof value === "string" && VALID_PROVIDERS.includes(value.toLowerCase() as PriceProvider);

export const isValidCryptoCurrency = (value: unknown): value is CryptoCurrency =>
  typeof value === "string" && VALID_CRYPTO_CURRENCIES.includes(value.toLowerCase() as CryptoCurrency);

export const isValidFiatCurrency = (value: unknown): value is FiatCurrency =>
  typeof value === "string" && VALID_FIAT_CURRENCIES.includes(value.toLowerCase() as FiatCurrency);

export type Direction = "onramp" | "offramp";

export interface PriceRequest {
  provider: PriceProvider;
  sourceCurrency: Currency;
  targetCurrency: Currency;
  amount: string;
  network?: string;
  direction: Direction;
}

// Validation function for direction
export const isValidDirection = (value: unknown): value is Direction =>
  typeof value === "string" && (value === "onramp" || value === "offramp");

// Validation function for currency based on direction
export const isValidCurrencyForDirection = (currency: unknown, expectedType: "crypto" | "fiat"): boolean => {
  return expectedType === "crypto" ? isValidCryptoCurrency(currency) : isValidFiatCurrency(currency);
};

/**
 * The standardized response format for all price providers.
 *
 * Direction-specific interpretation guide:
 *
 * For onramp (buying crypto with fiat):
 * - requestedAmount: The fiat amount the user is spending
 * - quoteAmount: The crypto amount the user will receive
 * - conversionPrice: The price of 1 unit of crypto in fiat
 *
 * For offramp (selling crypto for fiat):
 * - requestedAmount: The crypto amount the user is selling
 * - quoteAmount: The fiat amount the user will receive
 * - conversionPrice: The price of 1 unit of crypto in fiat
 */
export interface PriceResponseBase {
  requestedAmount: number;
  quoteAmount: number;
  totalFee: number;
  direction: Direction;
}

/**
 * Provider-specific response types
 * Each provider extends the base response with its own identifier
 */
export interface AlchemyPayPriceResponse extends PriceResponseBase {
  provider: "alchemypay";
  // AlchemyPay specific fields can be added here
}

export interface MoonpayPriceResponse extends PriceResponseBase {
  provider: "moonpay";
  // Moonpay specific fields can be added here
}

export interface TransakPriceResponse extends PriceResponseBase {
  provider: "transak";
  // Transak specific fields can be added here
}

export type PriceResponse = AlchemyPayPriceResponse | MoonpayPriceResponse | TransakPriceResponse;

export interface PriceErrorResponse {
  error: string;
}

// Types for the bundled price endpoint (GET /prices/all)

// Represents the result for a single provider in the bundled response
export type BundledPriceResult =
  | {
      status: "fulfilled";
      value: PriceResponse;
    }
  | {
      status: "rejected";
      reason: {
        message: string;
        status?: number;
      };
    };

// The complete response from the bundled price endpoint
export type AllPricesResponse = {
  [K in PriceProvider]?: BundledPriceResult;
};
