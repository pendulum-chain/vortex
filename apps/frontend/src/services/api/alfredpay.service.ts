import {
  AlfredpayAddFiatAccountRequest,
  AlfredpayAddFiatAccountResponse,
  AlfredpayCreateCustomerRequest,
  AlfredpayCreateCustomerResponse,
  AlfredpayFiatAccountRequirementsResponse,
  AlfredpayGetKycRedirectLinkResponse,
  AlfredpayGetKycStatusResponse,
  AlfredpayListFiatAccountsResponse,
  AlfredpayStatusResponse
} from "@vortexfi/shared";
import { apiClient } from "./api-client";

export const AlfredpayService = {
  /**
   * Register a new fiat account (first-party only — account owner must match KYC identity).
   */
  async addFiatAccount(payload: AlfredpayAddFiatAccountRequest): Promise<AlfredpayAddFiatAccountResponse> {
    const response = await apiClient.post<AlfredpayAddFiatAccountResponse>("/alfredpay/fiatAccounts", payload);
    return response.data;
  },
  /**
   * Create a new Alfredpay customer.
   */
  async createCustomer(country: string, type: string): Promise<AlfredpayCreateCustomerResponse> {
    const request: AlfredpayCreateCustomerRequest = {
      country,
      type: type as any // Type assertion as Enum might not be fully available in frontend yet or shared types import might need adjustment
    };
    const response = await apiClient.post<AlfredpayCreateCustomerResponse>("/alfredpay/createCustomer", request);
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
  async getAlfredpayStatus(country: string, email: string): Promise<AlfredpayStatusResponse> {
    const response = await apiClient.get<AlfredpayStatusResponse>("/alfredpay/alfredpayStatus", {
      params: { country, email }
    });
    return response.data;
  },

  /**
   * Get dynamic form requirements for a country + payment method combo.
   * Returns empty array on failure — callers should fall back to static forms.
   */
  async getFiatAccountRequirements(country: string, paymentMethod: string): Promise<AlfredpayFiatAccountRequirementsResponse> {
    const response = await apiClient.get<AlfredpayFiatAccountRequirementsResponse>("/alfredpay/fiatAccountRequirements", {
      params: { country, paymentMethod }
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
  /**
   * Get the status of a specific KYC submission.
   */
  async getKycStatus(country: string): Promise<AlfredpayGetKycStatusResponse> {
    const response = await apiClient.get<AlfredpayGetKycStatusResponse>("/alfredpay/getKycStatus", {
      params: { country }
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
  async notifyKycRedirectFinished(country: string): Promise<{ success: boolean }> {
    const response = await apiClient.post<{ success: boolean }>("/alfredpay/kycRedirectFinished", {
      country
    });
    return response.data;
  },

  /**
   * Notify that the KYC redirect link has been opened.
   */
  async notifyKycRedirectOpened(country: string): Promise<{ success: boolean }> {
    const response = await apiClient.post<{ success: boolean }>("/alfredpay/kycRedirectOpened", {
      country
    });
    return response.data;
  }
};
