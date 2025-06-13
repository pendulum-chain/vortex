import {
  AccountMeta,
  GetRampErrorLogsResponse,
  GetRampHistoryResponse,
  GetRampStatusResponse,
  PresignedTx,
  RampProcess,
  RegisterRampRequest,
  RegisterRampResponse,
  StartRampRequest,
  StartRampResponse,
} from '@packages/shared';
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
    additionalData?: RegisterRampRequest['additionalData'],
  ): Promise<RegisterRampResponse> {
    const request: RegisterRampRequest = {
      quoteId,
      signingAccounts,
      additionalData,
    };
    return apiRequest<RegisterRampResponse>('post', `${this.BASE_PATH}/register`, request);
  }

  /**
   * Start a ramping process
   * @param rampId The ramp ID
   * @param presignedTxs The presigned transactions
   * @param additionalData Additional data
   * @returns The started ramp process
   */
  static async startRamp(
    rampId: string,
    presignedTxs: PresignedTx[],
    additionalData?: StartRampRequest['additionalData'],
  ): Promise<StartRampResponse> {
    const request: StartRampRequest = {
      rampId,
      presignedTxs,
      additionalData,
    };
    return apiRequest<StartRampResponse>('post', `${this.BASE_PATH}/start`, request);
  }

  /**
   * Get the status of a ramping process
   * @param id The ramp ID
   * @returns The ramp process status
   */
  static async getRampStatus(id: string): Promise<GetRampStatusResponse> {
    return apiRequest<GetRampStatusResponse>('get', `${this.BASE_PATH}/${id}`);
  }

  /**
   * Get the error logs for a ramping process
   * @param id The ramp ID
   * @returns The error logs
   */
  static async getRampErrorLogs(id: string): Promise<GetRampErrorLogsResponse> {
    return apiRequest<GetRampErrorLogsResponse>('get', `${this.BASE_PATH}/${id}/errors`);
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
    onUpdate?: (status: RampProcess) => void,
    intervalMs = 3000,
    maxAttempts = 100,
  ): Promise<RampProcess> {
    let attempts = 0;

    const poll = async (): Promise<RampProcess> => {
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
  static async getRampHistory(walletAddress: string): Promise<GetRampHistoryResponse> {
    return apiRequest<GetRampHistoryResponse>('get', `${this.BASE_PATH}/history/${walletAddress}`);
  }
}
