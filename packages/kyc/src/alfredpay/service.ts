import type {
  AlfredpayCreateCustomerResponse,
  AlfredpayCustomerType,
  AlfredpayGetKybRedirectLinkResponse,
  AlfredpayGetKycRedirectLinkResponse,
  AlfredpayGetKycStatusResponse,
  AlfredpayKybCustomerAndBusiness,
  AlfredpayStatusResponse,
  SubmitKybInformationRequest,
  SubmitKybInformationResponse,
  SubmitKycInformationRequest,
  SubmitKycInformationResponse
} from "@vortexfi/shared";
import type { AlfredpayKycApi } from "./api";

type Params = Record<string, string | number | boolean | undefined>;

export interface AlfredpayKycApiClient {
  get<T>(url: string, config?: { params?: Params; signal?: AbortSignal }): Promise<T>;
  post<T>(url: string, data?: unknown, config?: { headers?: Record<string, string>; params?: Params }): Promise<T>;
}

function fileForm(fields: Record<string, string>, file: File): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  formData.append("file", file);
  return formData;
}

export function createAlfredpayKycApi(apiClient: AlfredpayKycApiClient): AlfredpayKycApi {
  return {
    createBusinessCustomer(country: string): Promise<AlfredpayCreateCustomerResponse> {
      return apiClient.post<AlfredpayCreateCustomerResponse>("/alfredpay/createBusinessCustomer", { country });
    },
    createIndividualCustomer(country: string): Promise<AlfredpayCreateCustomerResponse> {
      return apiClient.post<AlfredpayCreateCustomerResponse>("/alfredpay/createIndividualCustomer", { country });
    },
    findKybCustomerAndBusiness(country: string): Promise<AlfredpayKybCustomerAndBusiness[]> {
      return apiClient.get<AlfredpayKybCustomerAndBusiness[]>("/alfredpay/findKybCustomerAndBusiness", { params: { country } });
    },
    getAlfredpayStatus(country: string): Promise<AlfredpayStatusResponse> {
      return apiClient.get<AlfredpayStatusResponse>("/alfredpay/alfredpayStatus", { params: { country } });
    },
    getKybRedirectLink(country: string): Promise<AlfredpayGetKybRedirectLinkResponse> {
      return apiClient.get<AlfredpayGetKybRedirectLinkResponse>("/alfredpay/getKybRedirectLink", { params: { country } });
    },
    getKycRedirectLink(country: string): Promise<AlfredpayGetKycRedirectLinkResponse> {
      return apiClient.get<AlfredpayGetKycRedirectLinkResponse>("/alfredpay/getKycRedirectLink", { params: { country } });
    },
    getKycStatus(country: string, type?: AlfredpayCustomerType): Promise<AlfredpayGetKycStatusResponse> {
      return apiClient.get<AlfredpayGetKycStatusResponse>("/alfredpay/getKycStatus", { params: { country, type } });
    },
    notifyKycRedirectFinished(country: string, type?: AlfredpayCustomerType): Promise<{ success: boolean }> {
      return apiClient.post<{ success: boolean }>("/alfredpay/kycRedirectFinished", { country, type });
    },
    notifyKycRedirectOpened(country: string, type?: AlfredpayCustomerType): Promise<{ success: boolean }> {
      return apiClient.post<{ success: boolean }>("/alfredpay/kycRedirectOpened", { country, type });
    },
    retryKyc(country: string, type?: AlfredpayCustomerType): Promise<AlfredpayGetKycRedirectLinkResponse> {
      return apiClient.post<AlfredpayGetKycRedirectLinkResponse>("/alfredpay/retryKyc", { country, type });
    },
    async sendKybSubmission(country: string, submissionId: string): Promise<void> {
      await apiClient.post("/alfredpay/sendKybSubmission", { country, submissionId });
    },
    async sendKycSubmission(country: string, submissionId: string): Promise<void> {
      await apiClient.post("/alfredpay/sendKycSubmission", { country, submissionId });
    },
    async submitKybFile(country: string, submissionId: string, fileType: string, file: File): Promise<void> {
      await apiClient.post("/alfredpay/submitKybFile", fileForm({ country, fileType, submissionId }, file));
    },
    submitKybInformation(
      country: string,
      data: Omit<SubmitKybInformationRequest, "country">
    ): Promise<SubmitKybInformationResponse> {
      return apiClient.post<SubmitKybInformationResponse>("/alfredpay/submitKybInformation", { country, ...data });
    },
    async submitKybRelatedPersonFile(country: string, relatedPersonId: string, fileType: string, file: File): Promise<void> {
      await apiClient.post("/alfredpay/submitKybRelatedPersonFile", fileForm({ country, fileType, relatedPersonId }, file));
    },
    async submitKycFile(country: string, submissionId: string, fileType: string, file: File): Promise<void> {
      await apiClient.post("/alfredpay/submitKycFile", fileForm({ country, fileType, submissionId }, file));
    },
    submitKycInformation(
      country: string,
      data: Omit<SubmitKycInformationRequest, "country">
    ): Promise<SubmitKycInformationResponse> {
      return apiClient.post<SubmitKycInformationResponse>("/alfredpay/submitKycInformation", { country, ...data });
    }
  };
}
