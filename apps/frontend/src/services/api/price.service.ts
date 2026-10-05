import { AllPricesResponse, Currency, RampDirection } from "@vortexfi/shared";
import { apiRequest } from "./api-client";

/**
 * Service for interacting with Price API endpoints
 */
export class PriceService {
  private static readonly BASE_PATH = "/prices";

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
    network?: string,
    signal?: AbortSignal
  ): Promise<AllPricesResponse> {
    return apiRequest<AllPricesResponse>("get", `${this.BASE_PATH}/all`, undefined, {
      params: {
        amount,
        direction,
        network,
        sourceCurrency,
        targetCurrency
      },
      signal
    });
  }
}
