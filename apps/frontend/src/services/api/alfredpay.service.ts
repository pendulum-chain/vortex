import { createAlfredpayKycApi } from "@vortexfi/kyc";
import {
  DomesticAddFiatAccountRequest,
  DomesticAddFiatAccountResponse,
  DomesticFiatAccountRequirementsResponse,
  DomesticListFiatAccountsResponse
} from "@vortexfi/shared";
import { apiClient } from "./api-client";

export const AlfredpayService = {
  ...createAlfredpayKycApi(apiClient),
  async addFiatAccount(payload: DomesticAddFiatAccountRequest): Promise<DomesticAddFiatAccountResponse> {
    return apiClient.post<DomesticAddFiatAccountResponse>("/alfredpay/fiatAccounts", payload);
  },
  async deleteFiatAccount(fiatAccountId: string, country: string): Promise<void> {
    await apiClient.delete(`/alfredpay/fiatAccounts/${fiatAccountId}`, { params: { country } });
  },
  async getFiatAccountRequirements(country: string, paymentMethod: string): Promise<DomesticFiatAccountRequirementsResponse> {
    return apiClient.get<DomesticFiatAccountRequirementsResponse>("/alfredpay/fiatAccountRequirements", {
      params: { country, paymentMethod }
    });
  },
  async listFiatAccounts(country: string, signal?: AbortSignal): Promise<DomesticListFiatAccountsResponse> {
    return apiClient.get<DomesticListFiatAccountsResponse>("/alfredpay/fiatAccounts", { params: { country }, signal });
  }
};
