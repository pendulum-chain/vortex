import { CreateSiweRequest, CreateSiweResponse, ValidateSiweRequest, ValidateSiweResponse } from "@vortexfi/shared";
import { apiRequest } from "./api-client";

/**
 * Service for interacting with Sign-In with Ethereum (SIWE) API endpoints
 */
export class SiweService {
  private static readonly BASE_PATH = "/siwe";

  /**
   * Create a SIWE nonce
   * @param walletAddress The user's wallet address
   * @returns The nonce
   */
  static async createNonce(walletAddress: string): Promise<CreateSiweResponse> {
    const request: CreateSiweRequest = { walletAddress };
    return apiRequest<CreateSiweResponse>("post", `${this.BASE_PATH}/create`, request);
  }

  /**
   * Validate a SIWE signature
   * @param nonce The nonce
   * @param signature The signature
   * @param siweMessage The SIWE message
   * @returns Validation result
   */
  static async validateSignature(nonce: string, signature: string, siweMessage: string): Promise<ValidateSiweResponse> {
    const request: ValidateSiweRequest = {
      nonce,
      signature,
      siweMessage
    };
    return apiRequest<ValidateSiweResponse>("post", `${this.BASE_PATH}/validate`, request);
  }
}
