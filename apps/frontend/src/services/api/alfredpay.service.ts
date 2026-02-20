import {
  AlfredpayCreateCustomerRequest,
  AlfredpayCreateCustomerResponse,
  AlfredpayCustomerType,
  AlfredpayGetKybRedirectLinkResponse,
  AlfredpayGetKycRedirectLinkResponse,
  AlfredpayGetKycStatusResponse,
  AlfredpayStatusResponse
} from "@vortexfi/shared";
import { apiClient } from "./api-client";

export const AlfredpayService = {
  async createBusinessCustomer(country: string): Promise<AlfredpayCreateCustomerResponse> {
    const response = await apiClient.post<AlfredpayCreateCustomerResponse>("/alfredpay/createBusinessCustomer", {
      country
    });
    return response.data;
  },
  /**
   * Create a new Alfredpay customer.
   */
  async createCustomer(country: string): Promise<AlfredpayCreateCustomerResponse> {
    const request: AlfredpayCreateCustomerRequest = {
      country
    };
    const response = await apiClient.post<AlfredpayCreateCustomerResponse>("/alfredpay/createCustomer", request);
    return response.data;
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
