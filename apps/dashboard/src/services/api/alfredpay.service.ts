import { type AlfredpayKycApi, createAlfredpayKycApi } from "@vortexfi/kyc";
import type {
  AlfredpayAddFiatAccountRequest,
  AlfredpayAddFiatAccountResponse,
  AlfredpayListFiatAccountsResponse
} from "@vortexfi/shared";
import { apiClient } from "./api-client";

const managedProfileApiClient = {
  get: <T>(url: string, config?: { params?: Record<string, string | number | boolean | undefined>; signal?: AbortSignal }) =>
    apiClient.get<T>(url, { ...config, managedProfile: true }),
  post: <T>(
    url: string,
    data?: unknown,
    config?: { headers?: Record<string, string>; params?: Record<string, string | number | boolean | undefined> }
  ) => apiClient.post<T>(url, data, { ...config, managedProfile: true })
};

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
  ...createAlfredpayKycApi(managedProfileApiClient),

  addFiatAccount(payload: AlfredpayAddFiatAccountRequest): Promise<AlfredpayAddFiatAccountResponse> {
    return apiClient.post<AlfredpayAddFiatAccountResponse>("/alfredpay/fiatAccounts", payload, { managedProfile: true });
  },

  async deleteFiatAccount(fiatAccountId: string, country: string): Promise<void> {
    await apiClient.delete(`/alfredpay/fiatAccounts/${fiatAccountId}`, { managedProfile: true, params: { country } });
  },

  /**
   * The user's saved AlfredPay payout accounts for a country (US/MX/CO/AR). Each account's
   * `fiatAccountId` is the offramp payout target — the dashboard turns each into a
   * "send to yourself" recipient. 404s when the caller has no AlfredPay customer yet.
   */
  listFiatAccounts(country: string, signal?: AbortSignal): Promise<AlfredpayListFiatAccountsResponse> {
    return apiClient.get<AlfredpayListFiatAccountsResponse>("/alfredpay/fiatAccounts", {
      managedProfile: true,
      params: { country },
      signal
    });
  }
};
