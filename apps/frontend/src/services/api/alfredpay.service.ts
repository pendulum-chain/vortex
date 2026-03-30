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
  /**
   * Register a new fiat account.
   */
  async addFiatAccount(payload: AlfredpayAddFiatAccountRequest): Promise<AlfredpayAddFiatAccountResponse> {
    const response = await apiClient.post<AlfredpayAddFiatAccountResponse>("/alfredpay/fiatAccounts", payload);
    return response.data;
  },
  async createBusinessCustomer(country: string): Promise<AlfredpayCreateCustomerResponse> {
    const response = await apiClient.post<AlfredpayCreateCustomerResponse>("/alfredpay/createBusinessCustomer", {
      country
    });
    return response.data;
  },
  /**
   * Create a new Alfredpay individual customer.
   */
  async createIndividualCustomer(country: string): Promise<AlfredpayCreateCustomerResponse> {
    const request: AlfredpayCreateCustomerRequest = {
      country
    };
    const response = await apiClient.post<AlfredpayCreateCustomerResponse>("/alfredpay/createIndividualCustomer", request);
    return response.data;
  },

  /**
   * Delete a registered fiat account.
   */
  async deleteFiatAccount(fiatAccountId: string, country: string): Promise<void> {
    await apiClient.delete(`/alfredpay/fiatAccounts/${fiatAccountId}`, { params: { country } });
  },
  /**
   * Check Alfredpay status for a user in a specific country.
   */
  async getAlfredpayStatus(country: string): Promise<AlfredpayStatusResponse> {
    const response = await apiClient.get<AlfredpayStatusResponse>("/alfredpay/alfredpayStatus", {
      params: { country }
    });
    return response.data;
  },

  /**
   * Get dynamic form requirements for a country + payment method combo.
   */
  async getFiatAccountRequirements(country: string, paymentMethod: string): Promise<AlfredpayFiatAccountRequirementsResponse> {
    const response = await apiClient.get<AlfredpayFiatAccountRequirementsResponse>("/alfredpay/fiatAccountRequirements", {
      params: { country, paymentMethod }
    });
    return response.data;
  },

  async getKybRedirectLink(country: string): Promise<AlfredpayGetKybRedirectLinkResponse> {
    const response = await apiClient.get<AlfredpayGetKybRedirectLinkResponse>("/alfredpay/getKybRedirectLink", {
      params: { country }
    });
    return response.data;
  },

  /**
   * Get the KYC redirect link for a user.
   */
  async getKycRedirectLink(country: string): Promise<AlfredpayGetKycRedirectLinkResponse> {
    const response = await apiClient.get<AlfredpayGetKycRedirectLinkResponse>("/alfredpay/getKycRedirectLink", {
      params: { country }
    });
    return response.data;
  },

  /**
   * Get the status of a specific KYC submission.
   */
  async getKycStatus(country: string, type?: AlfredpayCustomerType): Promise<AlfredpayGetKycStatusResponse> {
    const response = await apiClient.get<AlfredpayGetKycStatusResponse>("/alfredpay/getKycStatus", {
      params: { country, type }
    });
    return response.data;
  },

  /**
   * List all registered fiat accounts for the current user in a given country.
   */
  async listFiatAccounts(country: string): Promise<AlfredpayListFiatAccountsResponse> {
    const response = await apiClient.get<AlfredpayListFiatAccountsResponse>("/alfredpay/fiatAccounts", {
      params: { country }
    });
    return response.data;
  },

  /**
   * Notify that the KYC redirect process is finished.
   */
  async notifyKycRedirectFinished(country: string, type?: AlfredpayCustomerType): Promise<{ success: boolean }> {
    const response = await apiClient.post<{ success: boolean }>("/alfredpay/kycRedirectFinished", {
      country,
      type
    });
    return response.data;
  },

  /**
   * Notify that the KYC redirect link has been opened.
   */
  async notifyKycRedirectOpened(country: string, type?: AlfredpayCustomerType): Promise<{ success: boolean }> {
    const response = await apiClient.post<{ success: boolean }>("/alfredpay/kycRedirectOpened", {
      country,
      type
    });
    return response.data;
  },

  async retryKyc(country: string, type?: AlfredpayCustomerType): Promise<AlfredpayGetKycRedirectLinkResponse> {
    const response = await apiClient.post<AlfredpayGetKycRedirectLinkResponse>("/alfredpay/retryKyc", {
      country,
      type
    });
    return response.data;
  }
};
