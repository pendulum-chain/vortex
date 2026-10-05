import {
  AccountMeta,
  GetRampHistoryResponse,
  GetRampStatusResponse,
  PresignedTx,
  RegisterRampRequest,
  RegisterRampResponse,
  StartRampRequest,
  StartRampResponse,
  UpdateRampRequest
} from "@vortexfi/shared";
import { apiRequest } from "./api-client";

/**
 * Service for interacting with Ramp API endpoints
 */
export class RampService {
  private static readonly BASE_PATH = "/ramp";

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
    additionalData?: RegisterRampRequest["additionalData"],
    userId?: string
  ): Promise<RegisterRampResponse> {
    const request: RegisterRampRequest & { userId?: string } = {
      additionalData,
      quoteId,
      signingAccounts,
      userId
    };
    return apiRequest<RegisterRampResponse>("post", `${this.BASE_PATH}/register`, request);
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
    additionalData?: UpdateRampRequest["additionalData"]
  ): Promise<StartRampResponse> {
    const request: UpdateRampRequest = {
      additionalData,
      presignedTxs,
      rampId
    };
    return apiRequest<StartRampResponse>("post", `${this.BASE_PATH}/update`, request);
  }

  /**
   * Start a ramping process
   * @param rampId The ramp ID
   * @returns The started ramp process
   */
  static async startRamp(rampId: string): Promise<StartRampResponse> {
    const request: StartRampRequest = {
      rampId
    };
    return apiRequest<StartRampResponse>("post", `${this.BASE_PATH}/start`, request);
  }

  /**
   * Get the status of a ramping process
   * @param id The ramp ID
   * @returns The ramp process status
   */
  static async getRampStatus(id: string): Promise<GetRampStatusResponse> {
    return apiRequest<GetRampStatusResponse>("get", `${this.BASE_PATH}/${id}`);
  }

  /**
   * Get transaction history for a wallet address
   * @param walletAddress The wallet address
   * @param limit The maximum number of records to return
   * @param offset The offset for pagination
   * @returns The transaction history
   */
  static async getRampHistory(
    walletAddress: string,
    limit?: number,
    offset?: number,
    signal?: AbortSignal
  ): Promise<GetRampHistoryResponse> {
    const queryParams = new URLSearchParams();
    if (limit) queryParams.append("limit", limit.toString());
    if (offset) queryParams.append("offset", offset.toString());

    const queryString = queryParams.toString();
    const url = `${this.BASE_PATH}/history/${walletAddress}${queryString ? `?${queryString}` : ""}`;

    return apiRequest<GetRampHistoryResponse>("get", url, undefined, { signal });
  }
}
