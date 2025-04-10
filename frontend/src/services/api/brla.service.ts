import { BrlaEndpoints, EvmAddress } from 'shared';
import { apiRequest } from './api-client';

/**
 * Service for interacting with BRLA API endpoints
 */
export class BrlaService {
  private static readonly BASE_PATH = '/brla';

  /**
   * Get BRLA user information by tax ID
   * @param taxId The user's tax ID
   * @returns The user's EVM wallet address
   */
  static async getUser(taxId: string): Promise<BrlaEndpoints.GetUserResponse> {
    return apiRequest<BrlaEndpoints.GetUserResponse>('get', `${this.BASE_PATH}/getUser`, undefined, {
      params: { taxId },
    });
  }

  /**
   * Get the status of an offramp operation
   * @param taxId The user's tax ID
   * @returns The offramp status
   */
  static async getOfframpStatus(taxId: string): Promise<BrlaEndpoints.GetOfframpStatusResponse> {
    return apiRequest<BrlaEndpoints.GetOfframpStatusResponse>('get', `${this.BASE_PATH}/getOfframpStatus`, undefined, {
      params: { taxId },
    });
  }

  /**
   * Get the KYC status of a subaccount
   * @param taxId The user's tax ID
   * @returns The KYC status
   */
  static async getKycStatus(taxId: string): Promise<BrlaEndpoints.GetKycStatusResponse> {
    return apiRequest<BrlaEndpoints.GetKycStatusResponse>('get', `${this.BASE_PATH}/getKycStatus`, undefined, {
      params: { taxId },
    });
  }

  /**
   * Validate a PIX key
   * @param pixKey The PIX key to validate
   * @returns Whether the PIX key is valid
   */
  static async validatePixKey(pixKey: string): Promise<BrlaEndpoints.ValidatePixKeyResponse> {
    return apiRequest<BrlaEndpoints.ValidatePixKeyResponse>('get', `${this.BASE_PATH}/validatePixKey`, undefined, {
      params: { pixKey },
    });
  }

  /**
   * Get a BR Code for payment
   * @param taxId The user's tax ID
   * @param amount The payment amount
   * @param receiverAddress The receiver's address
   * @returns The BR Code for payment
   */
  static async getPayInCode(
    taxId: string,
    amount: string,
    receiverAddress: EvmAddress,
  ): Promise<BrlaEndpoints.GetPayInCodeResponse> {
    return apiRequest<BrlaEndpoints.GetPayInCodeResponse>('get', `${this.BASE_PATH}/payIn`, undefined, {
      params: { taxId, amount, receiverAddress },
    });
  }

  /**
   * Trigger an offramp operation
   * @param request The offramp request
   * @returns The offramp ID
   */
  static async triggerOfframp(
    request: BrlaEndpoints.TriggerOfframpRequest,
  ): Promise<BrlaEndpoints.TriggerOfframpResponse> {
    return apiRequest<BrlaEndpoints.TriggerOfframpResponse>('post', `${this.BASE_PATH}/triggerOfframp`, request);
  }

  /**
   * Create a new subaccount
   * @param request The subaccount creation request
   * @returns The subaccount ID
   */
  static async createSubaccount(
    request: BrlaEndpoints.CreateSubaccountRequest,
  ): Promise<BrlaEndpoints.CreateSubaccountResponse> {
    return apiRequest<BrlaEndpoints.CreateSubaccountResponse>('post', `${this.BASE_PATH}/createSubaccount`, request);
  }

  /**
   * Trigger a pay-in operation
   * @param request The pay-in request
   * @returns Empty response with 200 status
   */
  static async triggerPayIn(
    request: BrlaEndpoints.TriggerPayInRequest,
  ): Promise<BrlaEndpoints.TriggerPayInResponse> {
    return apiRequest<BrlaEndpoints.TriggerPayInResponse>('post', `${this.BASE_PATH}/triggerPayIn`, request);
  }
}
