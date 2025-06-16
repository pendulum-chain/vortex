import { AccountMeta, PresignedTx, RampEndpoints } from '@packages/shared';
import { apiRequest } from './api-client';

/**
 * Service for interacting with Ramp API endpoints
 */
export class RampService {
  private static readonly BASE_PATH = '/ramp';

  /**
   * Register a new ramping process
   * @param quoteId The quote ID
   * @param signingAccounts The signing accounts
   * @param additionalData Additional data
   * @returns The registered ramp process
   */
  static async registerRamp(
    quoteId: string,
    signingAccounts: AccountMeta[],
    additionalData?: RampEndpoints.RegisterRampRequest['additionalData'],
  ): Promise<RampEndpoints.RegisterRampResponse> {
    const request: RampEndpoints.RegisterRampRequest = {
      quoteId,
      signingAccounts,
      additionalData,
    };
    return apiRequest<RampEndpoints.RegisterRampResponse>('post', `${this.BASE_PATH}/register`, request);
  }

  /**
   * Update a ramping process with presigned transactions and additional data
   * @param rampId The ramp ID
   * @param presignedTxs The presigned transactions
   * @param additionalData Additional data
   * @returns The updated ramp process
   */
  static async updateRamp(
    rampId: string,
    presignedTxs: PresignedTx[],
    additionalData?: RampEndpoints.UpdateRampRequest['additionalData'],
  ): Promise<RampEndpoints.UpdateRampResponse> {
    const request: RampEndpoints.UpdateRampRequest = {
      rampId,
      presignedTxs,
      additionalData,
    };
    return apiRequest<RampEndpoints.UpdateRampResponse>('post', `${this.BASE_PATH}/${rampId}/update`, request);
  }

  /**
   * Start a ramping process
   * @param rampId The ramp ID
   * @returns The started ramp process
   */
  static async startRamp(rampId: string): Promise<RampEndpoints.StartRampResponse> {
    const request: RampEndpoints.StartRampRequest = {
      rampId,
    };
    return apiRequest<RampEndpoints.StartRampResponse>('post', `${this.BASE_PATH}/start`, request);
  }

  /**
   * Get the status of a ramping process
   * @param id The ramp ID
   * @returns The ramp process status
   */
  static async getRampStatus(id: string): Promise<RampEndpoints.GetRampStatusResponse> {
    return apiRequest<RampEndpoints.GetRampStatusResponse>('get', `${this.BASE_PATH}/${id}`);
  }

  /**
   * Get the error logs for a ramping process
   * @param id The ramp ID
   * @returns The error logs
   */
  static async getRampErrorLogs(id: string): Promise<RampEndpoints.GetRampErrorLogsResponse> {
    return apiRequest<RampEndpoints.GetRampErrorLogsResponse>('get', `${this.BASE_PATH}/${id}/errors`);
  }

  /**
   * Poll the status of a ramping process until it reaches a final state
   * @param id The ramp ID
   * @param onUpdate Callback function to handle status updates
   * @param intervalMs Polling interval in milliseconds (default: 3000)
   * @param maxAttempts Maximum number of polling attempts (default: 100)
   * @returns The final status of the ramp process
   */
  static async pollRampStatus(
    id: string,
    onUpdate?: (status: RampEndpoints.RampProcess) => void,
    intervalMs = 3000,
    maxAttempts = 100,
  ): Promise<RampEndpoints.RampProcess> {
    let attempts = 0;

    const poll = async (): Promise<RampEndpoints.RampProcess> => {
      if (attempts >= maxAttempts) {
        throw new Error('Maximum polling attempts reached');
      }

      attempts++;
      const status = await this.getRampStatus(id);

      if (onUpdate) {
        onUpdate(status);
      }

      if (status.currentPhase === 'complete' || status.currentPhase === 'failed') {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      return poll();
    };

    return poll();
  }

  /**
   * Get transaction history for a wallet address
   * @param walletAddress The wallet address
   * @returns The transaction history
   */
  static async getRampHistory(walletAddress: string): Promise<RampEndpoints.GetRampHistoryResponse> {
    return apiRequest<RampEndpoints.GetRampHistoryResponse>('get', `${this.BASE_PATH}/history/${walletAddress}`);
  }
}
