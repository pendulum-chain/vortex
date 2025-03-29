export namespace PriceEndpoints {
  // GET /prices?provider=:provider&fromCrypto=:fromCrypto&toFiat=:toFiat&amount=:amount&network=:network
  export type Provider = 'alchemypay' | 'moonpay' | 'transak';
  export type CryptoCurrency = 'usdc' | 'usdce' | 'usdc.e' | 'usdt';
  export type FiatCurrency = 'eur' | 'ars' | 'brl';

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
}
