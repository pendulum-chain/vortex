import { PendulumFundEphemeralRequest, PendulumFundEphemeralResponse } from '@packages/shared';
import { apiRequest } from './api-client';

/**
 * Service for interacting with Pendulum API endpoints
 */
export class PendulumService {
  private static readonly BASE_PATH = '/pendulum';

  /**
   * Fund an ephemeral account
   * @param ephemeralAddress The address of the ephemeral account
   * @param requiresGlmr Whether the account requires GLMR tokens
   * @returns Success status
   */
  static async fundEphemeralAccount(
    ephemeralAddress: string,
    requiresGlmr?: boolean,
  ): Promise<PendulumFundEphemeralResponse> {
    const request: PendulumFundEphemeralRequest = {
      ephemeralAddress,
      requiresGlmr,
    };
    return apiRequest<PendulumFundEphemeralResponse>('post', `${this.BASE_PATH}/fundEphemeral`, request);
  }
}
