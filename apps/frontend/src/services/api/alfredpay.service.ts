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
  AlfredpayStatusResponse,
  SubmitKybInformationRequest,
  SubmitKybInformationResponse,
  SubmitKycInformationResponse
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
    const response = await apiClient.post<{ data: AlfredpayGetKycRedirectLinkResponse }>("/alfredpay/retryKyc", {
      country,
      type
    });
    return response.data;
  },

  async sendKybSubmission(country: string, submissionId: string): Promise<void> {
    await apiClient.post("/alfredpay/sendKybSubmission", { country, submissionId });
  },

  async sendKycSubmission(country: string, submissionId: string): Promise<void> {
    await apiClient.post("/alfredpay/sendKycSubmission", { country, submissionId });
  },

  async submitKybFile(country: string, submissionId: string, fileType: string, file: File): Promise<void> {
    const formData = new FormData();
    formData.append("country", country);
    formData.append("submissionId", submissionId);
    formData.append("fileType", fileType);
    formData.append("file", file);
    await apiClient.post("/alfredpay/submitKybFile", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
  },

  async submitKybInformation(
    country: string,
    data: Omit<SubmitKybInformationRequest, "country">
  ): Promise<{ submissionId: string }> {
    const response = await apiClient.post<{ data: SubmitKybInformationResponse }>("/alfredpay/submitKybInformation", {
      country,
      ...data
    });
    return response.data;
  },

  async submitKybRelatedPersonFile(country: string, relatedPersonId: string, fileType: string, file: File): Promise<void> {
    const formData = new FormData();
    formData.append("country", country);
    formData.append("relatedPersonId", relatedPersonId);
    formData.append("fileType", fileType);
    formData.append("file", file);
    await apiClient.post("/alfredpay/submitKybRelatedPersonFile", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
  },

  async submitKycFile(country: string, submissionId: string, fileType: string, file: File): Promise<void> {
    const formData = new FormData();
    formData.append("country", country);
    formData.append("submissionId", submissionId);
    formData.append("fileType", fileType);
    formData.append("file", file);
    await apiClient.post("/alfredpay/submitKycFile", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
  },

  async submitKycInformation(
    country: string,
    data: Omit<import("@vortexfi/shared").SubmitKycInformationRequest, "country">
  ): Promise<{ submissionId: string }> {
    const response = await apiClient.post<{ data: SubmitKycInformationResponse }>("/alfredpay/submitKycInformation", {
      country,
      ...data
    });
    return response.data;
  }
};
