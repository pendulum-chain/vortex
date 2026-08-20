import type {
  AlfredpayKybCustomerAndBusiness,
  DomesticCreateCustomerResponse,
  DomesticCustomerType,
  DomesticGetKybRedirectLinkResponse,
  DomesticGetKycRedirectLinkResponse,
  DomesticGetKycStatusResponse,
  DomesticStatusResponse,
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
    createBusinessCustomer(country: string): Promise<DomesticCreateCustomerResponse> {
      return apiClient.post<DomesticCreateCustomerResponse>("/alfredpay/createBusinessCustomer", { country });
    },
    createIndividualCustomer(country: string): Promise<DomesticCreateCustomerResponse> {
      return apiClient.post<DomesticCreateCustomerResponse>("/alfredpay/createIndividualCustomer", { country });
    },
    findKybCustomerAndBusiness(country: string): Promise<AlfredpayKybCustomerAndBusiness[]> {
      return apiClient.get<AlfredpayKybCustomerAndBusiness[]>("/alfredpay/findKybCustomerAndBusiness", { params: { country } });
    },
    getDomesticStatus(country: string): Promise<DomesticStatusResponse> {
      return apiClient.get<DomesticStatusResponse>("/alfredpay/alfredpayStatus", { params: { country } });
    },
    getKybRedirectLink(country: string): Promise<DomesticGetKybRedirectLinkResponse> {
      return apiClient.get<DomesticGetKybRedirectLinkResponse>("/alfredpay/getKybRedirectLink", { params: { country } });
    },
    getKycRedirectLink(country: string): Promise<DomesticGetKycRedirectLinkResponse> {
      return apiClient.get<DomesticGetKycRedirectLinkResponse>("/alfredpay/getKycRedirectLink", { params: { country } });
    },
    getKycStatus(country: string, type?: DomesticCustomerType): Promise<DomesticGetKycStatusResponse> {
      return apiClient.get<DomesticGetKycStatusResponse>("/alfredpay/getKycStatus", { params: { country, type } });
    },
    notifyKycRedirectFinished(country: string, type?: DomesticCustomerType): Promise<{ success: boolean }> {
      return apiClient.post<{ success: boolean }>("/alfredpay/kycRedirectFinished", { country, type });
    },
    notifyKycRedirectOpened(country: string, type?: DomesticCustomerType): Promise<{ success: boolean }> {
      return apiClient.post<{ success: boolean }>("/alfredpay/kycRedirectOpened", { country, type });
    },
    retryKyc(country: string, type?: DomesticCustomerType): Promise<DomesticGetKycRedirectLinkResponse> {
      return apiClient.post<DomesticGetKycRedirectLinkResponse>("/alfredpay/retryKyc", { country, type });
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
