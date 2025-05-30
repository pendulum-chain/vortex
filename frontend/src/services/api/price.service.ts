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
   * @param sourceCurrency The source currency (crypto for offramp, fiat for onramp)
   * @param targetCurrency The target currency (fiat for offramp, crypto for onramp)
   * @param amount The amount to convert
   * @param direction The direction of the conversion (onramp or offramp)
   * @param network Optional network name
   * @returns Price information
   */
  static async getPrice(
    provider: PriceEndpoints.Provider,
    sourceCurrency: PriceEndpoints.Currency,
    targetCurrency: PriceEndpoints.Currency,
    amount: string,
    direction: PriceEndpoints.Direction,
    network?: string,
  ): Promise<PriceEndpoints.PriceResponse> {
    return apiRequest<PriceEndpoints.PriceResponse>('get', this.BASE_PATH, undefined, {
      params: {
        provider,
        sourceCurrency,
        targetCurrency,
        amount,
        direction,
        network,
      },
    });
  }

  /**
   * Get price information from AlchemyPay
   * @param sourceCurrency The source currency (crypto for offramp, fiat for onramp)
   * @param targetCurrency The target currency (fiat for offramp, crypto for onramp)
   * @param amount The amount to convert
   * @param direction The direction of the conversion (onramp or offramp)
   * @param network Optional network name
   * @returns AlchemyPay price information
   */
  static async getAlchemyPayPrice(
    sourceCurrency: PriceEndpoints.Currency,
    targetCurrency: PriceEndpoints.Currency,
    amount: string,
    direction: PriceEndpoints.Direction,
    network?: string,
  ): Promise<PriceEndpoints.AlchemyPayPriceResponse> {
    const response = await this.getPrice('alchemypay', sourceCurrency, targetCurrency, amount, direction, network);
    return response as PriceEndpoints.AlchemyPayPriceResponse;
  }

  /**
   * Get price information from Moonpay
   * @param sourceCurrency The source currency (crypto for offramp, fiat for onramp)
   * @param targetCurrency The target currency (fiat for offramp, crypto for onramp)
   * @param amount The amount to convert
   * @param direction The direction of the conversion (onramp or offramp)
   * @param network Optional network name
   * @returns Moonpay price information
   */
  static async getMoonpayPrice(
    sourceCurrency: PriceEndpoints.Currency,
    targetCurrency: PriceEndpoints.Currency,
    amount: string,
    direction: PriceEndpoints.Direction,
  ): Promise<PriceEndpoints.MoonpayPriceResponse> {
    const response = await this.getPrice('moonpay', sourceCurrency, targetCurrency, amount, direction);
    return response as PriceEndpoints.MoonpayPriceResponse;
  }

  /**
   * Get price information from Transak
   * @param sourceCurrency The source currency (crypto for offramp, fiat for onramp)
   * @param targetCurrency The target currency (fiat for offramp, crypto for onramp)
   * @param amount The amount to convert
   * @param direction The direction of the conversion (onramp or offramp)
   * @param network Optional network name
   * @returns Transak price information
   */
  static async getTransakPrice(
    sourceCurrency: PriceEndpoints.Currency,
    targetCurrency: PriceEndpoints.Currency,
    amount: string,
    direction: PriceEndpoints.Direction,
    network?: string,
  ): Promise<PriceEndpoints.TransakPriceResponse> {
    const response = await this.getPrice('transak', sourceCurrency, targetCurrency, amount, direction, network);
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
  /**
   * Get price information from all providers using the bundled endpoint
   * @param sourceCurrency The source currency (crypto for offramp, fiat for onramp)
   * @param targetCurrency The target currency (fiat for offramp, crypto for onramp)
   * @param amount The amount to convert
   * @param direction The direction of the conversion (onramp or offramp)
   * @param network Optional network name
   * @returns Price information from all providers, including success/failure status for each
   */
  static async getAllPricesBundled(
    sourceCurrency: PriceEndpoints.Currency,
    targetCurrency: PriceEndpoints.Currency,
    amount: string,
    direction: PriceEndpoints.Direction,
    network?: string,
  ): Promise<PriceEndpoints.AllPricesResponse> {
    return apiRequest<PriceEndpoints.AllPricesResponse>('get', `${this.BASE_PATH}/all`, undefined, {
      params: {
        sourceCurrency,
        targetCurrency,
        amount,
        direction,
        network,
      },
    });
  }

  /**
   * @deprecated Use getAllPricesBundled instead for better error handling and performance
   * Get price information from all providers
   * @param sourceCurrency The source currency (crypto for offramp, fiat for onramp)
   * @param targetCurrency The target currency (fiat for offramp, crypto for onramp)
   * @param amount The amount to convert
   * @param direction The direction of the conversion (onramp or offramp)
   * @param network Optional network name
   * @returns Price information from all providers
   */
  static async getAllPrices(
    sourceCurrency: PriceEndpoints.Currency,
    targetCurrency: PriceEndpoints.Currency,
    amount: string,
    direction: PriceEndpoints.Direction,
    network?: string,
  ): Promise<Record<PriceEndpoints.Provider, PriceEndpoints.PriceResponse>> {
    const providers: PriceEndpoints.Provider[] = ['alchemypay', 'moonpay', 'transak'];

    const results = await Promise.allSettled(
      providers.map((provider) => this.getPrice(provider, sourceCurrency, targetCurrency, amount, direction, network)),
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
