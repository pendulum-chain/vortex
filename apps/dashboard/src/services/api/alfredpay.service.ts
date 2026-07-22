import { type AlfredpayKycApi, createAlfredpayKycApi } from "@vortexfi/kyc";
import type {
  AlfredpayAddFiatAccountRequest,
  AlfredpayAddFiatAccountResponse,
  AlfredpayListFiatAccountsResponse
} from "@vortexfi/shared";
import { apiClient } from "./api-client";

/**
 * The dashboard's Alfredpay endpoints. The KYC subset satisfies `AlfredpayKycApi`, which is what
 * `createAlfredpayKycMachine` verifies senders with. The same port drives MX/CO API-based company
 * KYB and US provider-hosted KYB.
 */
export const AlfredpayService: AlfredpayKycApi & {
  addFiatAccount(payload: AlfredpayAddFiatAccountRequest): Promise<AlfredpayAddFiatAccountResponse>;
  deleteFiatAccount(fiatAccountId: string, country: string): Promise<void>;
  listFiatAccounts(country: string, signal?: AbortSignal): Promise<AlfredpayListFiatAccountsResponse>;
} = {
  ...createAlfredpayKycApi(apiClient),

  addFiatAccount(payload: AlfredpayAddFiatAccountRequest): Promise<AlfredpayAddFiatAccountResponse> {
    return apiClient.post<AlfredpayAddFiatAccountResponse>("/alfredpay/fiatAccounts", payload);
  },

  async deleteFiatAccount(fiatAccountId: string, country: string): Promise<void> {
    await apiClient.delete(`/alfredpay/fiatAccounts/${fiatAccountId}`, { params: { country } });
  },

  /**
   * The user's saved AlfredPay payout accounts for a country (US/MX/CO/AR). Each account's
   * `fiatAccountId` is the offramp payout target — the dashboard turns each into a
   * "send to yourself" recipient. 404s when the caller has no AlfredPay customer yet.
   */
  listFiatAccounts(country: string, signal?: AbortSignal): Promise<AlfredpayListFiatAccountsResponse> {
    return apiClient.get<AlfredpayListFiatAccountsResponse>("/alfredpay/fiatAccounts", { params: { country }, signal });
  }
};
