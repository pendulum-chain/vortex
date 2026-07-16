import {
  AveniaKYCDataUpload,
  AveniaKYCDataUploadRequest,
  BrlaGetUserRemainingLimitResponse,
  BrlaGetUserResponse,
  BrlaValidatePixKeyResponse,
  RampDirection
} from "@vortexfi/shared";
import { apiRequest } from "./api-client";

/**
 * Service for interacting with BRLA API endpoints
 */
export class BrlaService {
  private static readonly BASE_PATH = "/brla";

  /**
   * Get BRLA user information by tax ID
   * @param taxId The user's tax ID
   * @returns The user's EVM wallet address
   */
  static async getUser(taxId: string): Promise<BrlaGetUserResponse> {
    return apiRequest<BrlaGetUserResponse>("get", `${this.BASE_PATH}/getUser`, undefined, {
      params: { taxId }
    });
  }

  /**
   * Record the initial KYC attempt for a user
   * @param taxId
   * @param quoteId
   * @returns An empty response
   **/
  static async recordInitialKycAttempt(taxId: string, quoteId: string, sessionId?: string): Promise<Record<string, never>> {
    return apiRequest<Record<string, never>>("post", `${this.BASE_PATH}/kyc/record-attempt`, { quoteId, sessionId, taxId });
  }
  /**
   * Validate a PIX key
   * @param pixKey The PIX key to validate
   * @returns Whether the PIX key is valid
   */
  static async validatePixKey(pixKey: string): Promise<BrlaValidatePixKeyResponse> {
    return apiRequest<BrlaValidatePixKeyResponse>("get", `${this.BASE_PATH}/validatePixKey`, undefined, {
      params: { pixKey }
    });
  }

  /**
   * Get the remaining limit for a user
   * @param taxId The user's tax ID
   * @param direction The ramp direction
   * @returns The remaining limit
   */
  static async getUserRemainingLimit(taxId: string, direction: RampDirection): Promise<BrlaGetUserRemainingLimitResponse> {
    return apiRequest<BrlaGetUserRemainingLimitResponse>("get", `${this.BASE_PATH}/getUserRemainingLimit`, undefined, {
      params: { direction, taxId }
    });
  }

  /**
   * Get urls to upload KYC documents for a new subaccount
   * @param request The subaccount creation request
   * @returns The upload URLs and their corresponding IDs
   */
  static async getUploadUrls(request: AveniaKYCDataUploadRequest): Promise<AveniaKYCDataUpload> {
    return apiRequest<AveniaKYCDataUpload>("post", `${this.BASE_PATH}/getUploadUrls`, request);
  }
}
