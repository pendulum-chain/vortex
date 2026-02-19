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
   * Check Alfredpay status for a user in a specific country.
   */
  async getAlfredpayStatus(country: string): Promise<AlfredpayStatusResponse> {
    const response = await apiClient.get<AlfredpayStatusResponse>("/alfredpay/alfredpayStatus", {
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
  }
};
