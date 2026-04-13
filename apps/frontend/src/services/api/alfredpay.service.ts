import {
  AlfredpayAddFiatAccountRequest,
  AlfredpayAddFiatAccountResponse,
  AlfredpayCreateCustomerRequest,
  AlfredpayCreateCustomerResponse,
  AlfredpayCustomerType,
  AlfredpayFiatAccountRequirementsResponse,
  AlfredpayGetKybRedirectLinkResponse,
  AlfredpayGetKycRedirectLinkResponse,
  AlfredpayGetKycStatusResponse,
  AlfredpayListFiatAccountsResponse,
  AlfredpayStatusResponse
} from "@vortexfi/shared";
import { apiClient } from "./api-client";

export const AlfredpayService = {
  async addFiatAccount(payload: AlfredpayAddFiatAccountRequest): Promise<AlfredpayAddFiatAccountResponse> {
    return apiClient.post<AlfredpayAddFiatAccountResponse>("/alfredpay/fiatAccounts", payload);
  },
  async createBusinessCustomer(country: string): Promise<AlfredpayCreateCustomerResponse> {
    return apiClient.post<AlfredpayCreateCustomerResponse>("/alfredpay/createBusinessCustomer", { country });
  },
  async createIndividualCustomer(country: string): Promise<AlfredpayCreateCustomerResponse> {
    const request: AlfredpayCreateCustomerRequest = { country };
    return apiClient.post<AlfredpayCreateCustomerResponse>("/alfredpay/createIndividualCustomer", request);
  },
  async deleteFiatAccount(fiatAccountId: string, country: string): Promise<void> {
    await apiClient.delete(`/alfredpay/fiatAccounts/${fiatAccountId}`, { params: { country } });
  },
  async getAlfredpayStatus(country: string): Promise<AlfredpayStatusResponse> {
    return apiClient.get<AlfredpayStatusResponse>("/alfredpay/alfredpayStatus", { params: { country } });
  },
  async getFiatAccountRequirements(country: string, paymentMethod: string): Promise<AlfredpayFiatAccountRequirementsResponse> {
    return apiClient.get<AlfredpayFiatAccountRequirementsResponse>("/alfredpay/fiatAccountRequirements", {
      params: { country, paymentMethod }
    });
  },
  async getKybRedirectLink(country: string): Promise<AlfredpayGetKybRedirectLinkResponse> {
    return apiClient.get<AlfredpayGetKybRedirectLinkResponse>("/alfredpay/getKybRedirectLink", { params: { country } });
  },
  async getKycRedirectLink(country: string): Promise<AlfredpayGetKycRedirectLinkResponse> {
    return apiClient.get<AlfredpayGetKycRedirectLinkResponse>("/alfredpay/getKycRedirectLink", { params: { country } });
  },
  async getKycStatus(country: string, type?: AlfredpayCustomerType): Promise<AlfredpayGetKycStatusResponse> {
    return apiClient.get<AlfredpayGetKycStatusResponse>("/alfredpay/getKycStatus", { params: { country, type } });
  },
  async listFiatAccounts(country: string, signal?: AbortSignal): Promise<AlfredpayListFiatAccountsResponse> {
    return apiClient.get<AlfredpayListFiatAccountsResponse>("/alfredpay/fiatAccounts", { params: { country }, signal });
  },
  async notifyKycRedirectFinished(country: string, type?: AlfredpayCustomerType): Promise<{ success: boolean }> {
    return apiClient.post<{ success: boolean }>("/alfredpay/kycRedirectFinished", { country, type });
  },
  async notifyKycRedirectOpened(country: string, type?: AlfredpayCustomerType): Promise<{ success: boolean }> {
    return apiClient.post<{ success: boolean }>("/alfredpay/kycRedirectOpened", { country, type });
  },
  async retryKyc(country: string, type?: AlfredpayCustomerType): Promise<AlfredpayGetKycRedirectLinkResponse> {
    return apiClient.post<AlfredpayGetKycRedirectLinkResponse>("/alfredpay/retryKyc", { country, type });
  }
};
