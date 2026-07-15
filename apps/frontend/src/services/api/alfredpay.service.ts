import { createAlfredpayKycApi } from "@vortexfi/kyc";
import {
  AlfredpayAddFiatAccountRequest,
  AlfredpayAddFiatAccountResponse,
  AlfredpayFiatAccountRequirementsResponse,
  AlfredpayListFiatAccountsResponse
} from "@vortexfi/shared";
import { apiClient } from "./api-client";

export const AlfredpayService = {
  ...createAlfredpayKycApi(apiClient),
  async addFiatAccount(payload: AlfredpayAddFiatAccountRequest): Promise<AlfredpayAddFiatAccountResponse> {
    return apiClient.post<AlfredpayAddFiatAccountResponse>("/alfredpay/fiatAccounts", payload);
  },
  async deleteFiatAccount(fiatAccountId: string, country: string): Promise<void> {
    await apiClient.delete(`/alfredpay/fiatAccounts/${fiatAccountId}`, { params: { country } });
  },
  async getFiatAccountRequirements(country: string, paymentMethod: string): Promise<AlfredpayFiatAccountRequirementsResponse> {
    return apiClient.get<AlfredpayFiatAccountRequirementsResponse>("/alfredpay/fiatAccountRequirements", {
      params: { country, paymentMethod }
    });
  },
  async listFiatAccounts(country: string, signal?: AbortSignal): Promise<AlfredpayListFiatAccountsResponse> {
    return apiClient.get<AlfredpayListFiatAccountsResponse>("/alfredpay/fiatAccounts", { params: { country }, signal });
  }
};
