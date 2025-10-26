import {
  SubsidizePostSwapRequest,
  SubsidizePostSwapResponse,
  SubsidizePreSwapRequest,
  SubsidizePreSwapResponse
} from "@packages/shared";
import { apiRequest } from "./api-client";

/**
 * Service for interacting with Subsidize API endpoints
 */
export class SubsidizeService {
  private static readonly BASE_PATH = "/subsidize";

  /**
   * Subsidize a pre-swap operation
   * @param address The address to subsidize
   * @param amountRaw The raw amount to subsidize
   * @param tokenToSubsidize The token to subsidize
   * @returns Success message
   */
  static async subsidizePreSwap(
    address: string,
    amountRaw: string,
    tokenToSubsidize: string
  ): Promise<SubsidizePreSwapResponse> {
    const request: SubsidizePreSwapRequest = {
      address,
      amountRaw,
      tokenToSubsidize
    };
    return apiRequest<SubsidizePreSwapResponse>("post", `${this.BASE_PATH}/preswap`, request);
  }

  /**
   * Subsidize a post-swap operation
   * @param address The address to subsidize
   * @param amountRaw The raw amount to subsidize
   * @param token The token to subsidize
   * @returns Success message
   */
  static async subsidizePostSwap(address: string, amountRaw: string, token: string): Promise<SubsidizePostSwapResponse> {
    const request: SubsidizePostSwapRequest = {
      address,
      amountRaw,
      token
    };
    return apiRequest<SubsidizePostSwapResponse>("post", `${this.BASE_PATH}/postswap`, request);
  }
}
