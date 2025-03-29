import { RampEndpoints } from 'shared';
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
    signingAccounts: string[],
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
   * Start a ramping process
   * @param rampId The ramp ID
   * @param presignedTxs The presigned transactions
   * @param additionalData Additional data
   * @returns The started ramp process
   */
  static async startRamp(
    rampId: string,
    presignedTxs: RampEndpoints.PresignedTransaction[],
    additionalData?: RampEndpoints.StartRampRequest['additionalData'],
  ): Promise<RampEndpoints.RampProcess> {
    const request: RampEndpoints.StartRampRequest = {
      rampId,
      presignedTxs,
      additionalData,
    };
    return apiRequest<RampEndpoints.RampProcess>('post', `${this.BASE_PATH}/start`, request);
  }

  /**
   * Get the status of a ramping process
   * @param id The ramp ID
   * @returns The ramp process status
   */
  static async getRampStatus(id: string): Promise<RampEndpoints.RampProcess> {
    return apiRequest<RampEndpoints.RampProcess>('get', `${this.BASE_PATH}/${id}`);
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

      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      return poll();
    };

    return poll();
  }

  /**
   * Create a complete ramping flow from quote to completion
   * @param quoteId The quote ID
   * @param signingAccounts The signing accounts
   * @param presignedTxsProvider Function that returns presigned transactions
   * @param additionalData Additional data
   * @param onStatusUpdate Callback function to handle status updates
   * @returns The final status of the ramp process
   */
  static async createRampFlow(
    quoteId: string,
    signingAccounts: string[],
    presignedTxsProvider: (rampId: string) => Promise<RampEndpoints.PresignedTransaction[]>,
    additionalData?: RampEndpoints.RegisterRampRequest['additionalData'],
    onStatusUpdate?: (status: RampEndpoints.RampProcess) => void,
  ): Promise<RampEndpoints.RampProcess> {
    // Step 1: Register the ramp process
    const registeredRamp = await this.registerRamp(quoteId, signingAccounts, additionalData);

    // Step 2: Generate presigned transactions
    const presignedTxs = await presignedTxsProvider(registeredRamp.id);

    // Step 3: Start the ramp process
    const startedRamp = await this.startRamp(registeredRamp.id, presignedTxs, additionalData);

    // Step 4: Poll for status updates until completion
    return this.pollRampStatus(startedRamp.id, onStatusUpdate);
  }
}
