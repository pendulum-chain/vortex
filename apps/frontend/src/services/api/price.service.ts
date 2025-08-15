import { AllPricesResponse, BundledPriceResult, Currency, PriceProvider, RampDirection } from "@packages/shared";
import { apiRequest } from "./api-client";

/**
 * Service for interacting with Price API endpoints
 */
export class PriceService {
  private static readonly BASE_PATH = "/prices";

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
    provider: PriceProvider,
    sourceCurrency: Currency,
    targetCurrency: Currency,
    amount: string,
    direction: RampDirection,
    network?: string
  ): Promise<BundledPriceResult> {
    return apiRequest<BundledPriceResult>("get", this.BASE_PATH, undefined, {
      params: {
        amount,
        direction,
        network,
        provider,
        sourceCurrency,
        targetCurrency
      }
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
    sourceCurrency: Currency,
    targetCurrency: Currency,
    amount: string,
    direction: RampDirection,
    network?: string
  ): Promise<BundledPriceResult> {
    const response = await this.getPrice("alchemypay", sourceCurrency, targetCurrency, amount, direction, network);
    return response;
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
    sourceCurrency: Currency,
    targetCurrency: Currency,
    amount: string,
    direction: RampDirection
  ): Promise<BundledPriceResult> {
    const response = await this.getPrice("moonpay", sourceCurrency, targetCurrency, amount, direction);
    return response;
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
    sourceCurrency: Currency,
    targetCurrency: Currency,
    amount: string,
    direction: RampDirection,
    network?: string
  ): Promise<BundledPriceResult> {
    const response = await this.getPrice("transak", sourceCurrency, targetCurrency, amount, direction, network);
    return response;
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
    sourceCurrency: Currency,
    targetCurrency: Currency,
    amount: string,
    direction: RampDirection,
    network?: string
  ): Promise<AllPricesResponse> {
    return apiRequest<AllPricesResponse>("get", `${this.BASE_PATH}/all`, undefined, {
      params: {
        amount,
        direction,
        network,
        sourceCurrency,
        targetCurrency
      }
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
    sourceCurrency: Currency,
    targetCurrency: Currency,
    amount: string,
    direction: RampDirection,
    network?: string
  ): Promise<Record<PriceProvider, BundledPriceResult>> {
    const providers: PriceProvider[] = ["alchemypay", "moonpay", "transak"];

    const results = await Promise.allSettled(
      providers.map(provider => this.getPrice(provider, sourceCurrency, targetCurrency, amount, direction, network))
    );

    return results.reduce(
      (acc, result, index) => {
        const provider = providers[index];
        if (result.status === "fulfilled") {
          acc[provider] = result.value;
        }
        return acc;
      },
      {} as Record<PriceProvider, BundledPriceResult>
    );
  }
}
