import {
  BrlaCreateSubaccountRequest,
  BrlaCreateSubaccountResponse,
  BrlaGetKycStatusResponse,
  BrlaGetRampStatusResponse,
  BrlaGetUserRemainingLimitResponse,
  BrlaGetUserResponse,
  BrlaKYCDataUploadFileFiles,
  BrlaStartKYC2Response,
  BrlaTriggerOfframpRequest,
  BrlaTriggerOfframpResponse,
  BrlaValidatePixKeyResponse,
  StartKYC2Request
} from "@packages/shared";
import { apiRequest } from "./api-client";

export type KYCDataUploadFileFiles = BrlaKYCDataUploadFileFiles;
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
   * @returns The remaining limit for onramp and offramp
   */
  static async getUserRemainingLimit(taxId: string): Promise<BrlaGetUserRemainingLimitResponse> {
    return apiRequest<BrlaGetUserRemainingLimitResponse>("get", `${this.BASE_PATH}/getUserRemainingLimit`, undefined, {
      params: { taxId }
    });
  }

  /**
   * Trigger an offramp operation
   * @param request The offramp request
   * @returns The offramp ID
   */
  static async triggerOfframp(request: BrlaTriggerOfframpRequest): Promise<BrlaTriggerOfframpResponse> {
    return apiRequest<BrlaTriggerOfframpResponse>("post", `${this.BASE_PATH}/triggerOfframp`, request);
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
   * Start KYC level 2 process
   * @param request Tax id and document type that will be used.
   * @returns The url's to upload the documents.
   */
  static async startKYC2(request: StartKYC2Request): Promise<BrlaStartKYC2Response> {
    return apiRequest<BrlaStartKYC2Response>("post", `${this.BASE_PATH}/startKYC2`, request);
  }
}
