export namespace PriceEndpoints {
  // GET /prices?provider=:provider&fromCrypto=:fromCrypto&toFiat=:toFiat&amount=:amount&network=:network
  export const VALID_PROVIDERS = ['alchemypay', 'moonpay', 'transak'] as const;
  export const VALID_CRYPTO_CURRENCIES = ['usdc', 'usdce', 'usdc.e', 'usdt'] as const;
  export const VALID_FIAT_CURRENCIES = ['eur', 'ars', 'brl'] as const;

  export type Provider = (typeof VALID_PROVIDERS)[number];
  export type CryptoCurrency = (typeof VALID_CRYPTO_CURRENCIES)[number];
  export type FiatCurrency = (typeof VALID_FIAT_CURRENCIES)[number];

  // Validation functions
  export const isValidProvider = (value: unknown): value is Provider =>
    typeof value === 'string' && VALID_PROVIDERS.includes(value.toLowerCase() as Provider);

  export const isValidCryptoCurrency = (value: unknown): value is CryptoCurrency =>
    typeof value === 'string' && VALID_CRYPTO_CURRENCIES.includes(value.toLowerCase() as CryptoCurrency);

  export const isValidFiatCurrency = (value: unknown): value is FiatCurrency =>
    typeof value === 'string' && VALID_FIAT_CURRENCIES.includes(value.toLowerCase() as FiatCurrency);

  export interface PriceRequest {
    provider: Provider;
    fromCrypto: CryptoCurrency;
    toFiat: FiatCurrency;
    amount: string;
    network?: string;
  }

  // The response varies by provider, so we define a base interface with common fields
  export interface PriceResponseBase {
    amount: string;
    fiatAmount: string;
    fiatCurrency: FiatCurrency;
    cryptoCurrency: CryptoCurrency;
    rate: string;
    fee?: string;
    networkFee?: string;
    totalFee?: string;

    [key: string]: any; // Additional provider-specific fields
  }

  // Provider-specific response types
  export interface AlchemyPayPriceResponse extends PriceResponseBase {
    provider: 'alchemypay';
    // AlchemyPay specific fields
  }

  export interface MoonpayPriceResponse extends PriceResponseBase {
    provider: 'moonpay';
    // Moonpay specific fields
  }

  export interface TransakPriceResponse extends PriceResponseBase {
    provider: 'transak';
    // Transak specific fields
  }

  export type PriceResponse = AlchemyPayPriceResponse | MoonpayPriceResponse | TransakPriceResponse;

  export interface PriceErrorResponse {
    error: string;
  }

  // Types for the bundled price endpoint (GET /prices/all)

  // Represents the result for a single provider in the bundled response
  export type BundledPriceResult =
    | {
        status: 'fulfilled';
        value: PriceResponse;
      }
    | {
        status: 'rejected';
        reason: {
          message: string;
          status?: number;
        };
      };

  // The complete response from the bundled price endpoint
  export type AllPricesResponse = {
    [K in Provider]?: BundledPriceResult;
  };
}
