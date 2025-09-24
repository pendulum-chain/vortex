import {
  AveniaKYCDataUpload,
  AveniaKYCDataUploadRequest,
  BrlaCreateSubaccountRequest,
  BrlaCreateSubaccountResponse,
  BrlaGetKycStatusResponse,
  BrlaGetRampStatusResponse,
  BrlaGetSelfieLivenessUrlResponse,
  BrlaGetUserRemainingLimitResponse,
  BrlaGetUserResponse,
  BrlaValidatePixKeyResponse,
  RampDirection
} from "@packages/shared";
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
   * Get the status of an offramp operation
   * @param taxId The user's tax ID
   * @returns The offramp status
   */
  static async getRampStatus(taxId: string): Promise<BrlaGetRampStatusResponse> {
    return apiRequest<BrlaGetRampStatusResponse>("get", `${this.BASE_PATH}/getRampStatus`, undefined, {
      params: { taxId }
    });
  }

  /**
   * Get the KYC status of a subaccount
   * @param taxId The user's tax ID
   * @returns The KYC status
   */
  static async getKycStatus(taxId: string): Promise<BrlaGetKycStatusResponse> {
    return apiRequest<BrlaGetKycStatusResponse>("get", `${this.BASE_PATH}/getKycStatus`, undefined, {
      params: { taxId }
    });
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
   * Create a new subaccount
   * @param request The subaccount creation request
   * @returns The subaccount ID
   */
  static async createSubaccount(request: BrlaCreateSubaccountRequest): Promise<BrlaCreateSubaccountResponse> {
    return apiRequest<BrlaCreateSubaccountResponse>("post", `${this.BASE_PATH}/createSubaccount`, request);
  }

  /**
   * Get urls to upload KYC documents for a new subaccount
   * @param request The subaccount creation request
   * @returns The upload URLs and their corresponding IDs
   */
  static async getUploadUrls(request: AveniaKYCDataUploadRequest): Promise<AveniaKYCDataUpload> {
    return apiRequest<AveniaKYCDataUpload>("post", `${this.BASE_PATH}/getUploadUrls`, request);
  }

  /**
   * Get a new liveness URL for selfie verification. Used for refreshing a stale one.
   * @param request The subaccount creation request
   * @returns The upload URLs and their corresponding IDs
   */
  static async getSelfieLivenessUrl(taxId: string): Promise<BrlaGetSelfieLivenessUrlResponse> {
    return apiRequest<BrlaGetSelfieLivenessUrlResponse>("get", `${this.BASE_PATH}/getSelfieLivenessUrl`, undefined, {
      params: { taxId }
    });
  }
}
