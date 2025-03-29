import { PriceEndpoints } from 'shared';
import { apiRequest } from './api-client';

/**
 * Service for interacting with Price API endpoints
 */
export class PriceService {
  private static readonly BASE_PATH = '/prices';

  /**
   * Get price information from a provider
   * @param provider The provider name
   * @param fromCrypto The source cryptocurrency
   * @param toFiat The target fiat currency
   * @param amount The amount to convert
   * @param network Optional network name
   * @returns Price information
   */
  static async getPrice(
    provider: PriceEndpoints.Provider,
    fromCrypto: PriceEndpoints.CryptoCurrency,
    toFiat: PriceEndpoints.FiatCurrency,
    amount: string,
    network?: string,
  ): Promise<PriceEndpoints.PriceResponse> {
    return apiRequest<PriceEndpoints.PriceResponse>('get', this.BASE_PATH, undefined, {
      params: {
        provider,
        fromCrypto,
        toFiat,
        amount,
        network,
      },
    });
  }

  /**
   * Get price information from AlchemyPay
   * @param fromCrypto The source cryptocurrency
   * @param toFiat The target fiat currency
   * @param amount The amount to convert
   * @param network Optional network name
   * @returns AlchemyPay price information
   */
  static async getAlchemyPayPrice(
    fromCrypto: PriceEndpoints.CryptoCurrency,
    toFiat: PriceEndpoints.FiatCurrency,
    amount: string,
    network?: string,
  ): Promise<PriceEndpoints.AlchemyPayPriceResponse> {
    const response = await this.getPrice('alchemypay', fromCrypto, toFiat, amount, network);
    return response as PriceEndpoints.AlchemyPayPriceResponse;
  }

  /**
   * Get price information from Moonpay
   * @param fromCrypto The source cryptocurrency
   * @param toFiat The target fiat currency
   * @param amount The amount to convert
   * @param network Optional network name
   * @returns Moonpay price information
   */
  static async getMoonpayPrice(
    fromCrypto: PriceEndpoints.CryptoCurrency,
    toFiat: PriceEndpoints.FiatCurrency,
    amount: string,
    network?: string,
  ): Promise<PriceEndpoints.MoonpayPriceResponse> {
    const response = await this.getPrice('moonpay', fromCrypto, toFiat, amount, network);
    return response as PriceEndpoints.MoonpayPriceResponse;
  }

  /**
   * Get price information from Transak
   * @param fromCrypto The source cryptocurrency
   * @param toFiat The target fiat currency
   * @param amount The amount to convert
   * @param network Optional network name
   * @returns Transak price information
   */
  static async getTransakPrice(
    fromCrypto: PriceEndpoints.CryptoCurrency,
    toFiat: PriceEndpoints.FiatCurrency,
    amount: string,
    network?: string,
  ): Promise<PriceEndpoints.TransakPriceResponse> {
    const response = await this.getPrice('transak', fromCrypto, toFiat, amount, network);
    return response as PriceEndpoints.TransakPriceResponse;
  }

  /**
   * Get price information from all providers
   * @param fromCrypto The source cryptocurrency
   * @param toFiat The target fiat currency
   * @param amount The amount to convert
   * @param network Optional network name
   * @returns Price information from all providers
   */
  static async getAllPrices(
    fromCrypto: PriceEndpoints.CryptoCurrency,
    toFiat: PriceEndpoints.FiatCurrency,
    amount: string,
    network?: string,
  ): Promise<Record<PriceEndpoints.Provider, PriceEndpoints.PriceResponse>> {
    const providers: PriceEndpoints.Provider[] = ['alchemypay', 'moonpay', 'transak'];

    const results = await Promise.allSettled(
      providers.map((provider) => this.getPrice(provider, fromCrypto, toFiat, amount, network)),
    );

    return results.reduce((acc, result, index) => {
      const provider = providers[index];
      if (result.status === 'fulfilled') {
        acc[provider] = result.value;
      }
      return acc;
    }, {} as Record<PriceEndpoints.Provider, PriceEndpoints.PriceResponse>);
  }
}
