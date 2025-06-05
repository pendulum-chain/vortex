import { SiweEndpoints } from 'shared';
import { apiRequest } from './api-client';

/**
 * Service for interacting with Sign-In with Ethereum (SIWE) API endpoints
 */
export class SiweService {
  private static readonly BASE_PATH = '/siwe';

  /**
   * Create a SIWE nonce
   * @param walletAddress The user's wallet address
   * @returns The nonce
   */
  static async createNonce(walletAddress: string): Promise<SiweEndpoints.CreateSiweResponse> {
    const request: SiweEndpoints.CreateSiweRequest = { walletAddress };
    return apiRequest<SiweEndpoints.CreateSiweResponse>('post', `${this.BASE_PATH}/create`, request);
  }

  /**
   * Validate a SIWE signature
   * @param nonce The nonce
   * @param signature The signature
   * @param siweMessage The SIWE message
   * @returns Validation result
   */
  static async validateSignature(
    nonce: string,
    signature: string,
    siweMessage: string,
  ): Promise<SiweEndpoints.ValidateSiweResponse> {
    const request: SiweEndpoints.ValidateSiweRequest = {
      nonce,
      signature,
      siweMessage,
    };
    return apiRequest<SiweEndpoints.ValidateSiweResponse>('post', `${this.BASE_PATH}/validate`, request);
  }
}
