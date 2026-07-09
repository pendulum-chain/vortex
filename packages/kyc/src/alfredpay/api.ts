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

/**
 * The Alfredpay endpoints the KYC machine calls. Each host supplies its own implementation so
 * the machine never reaches for a module-scoped API client — that import is what previously
 * pinned this logic inside the widget. Fiat-account endpoints are intentionally absent: they
 * belong to payout setup, not verification.
 */
export interface AlfredpayKycApi {
  createBusinessCustomer(country: string): Promise<AlfredpayCreateCustomerResponse>;
  createIndividualCustomer(country: string): Promise<AlfredpayCreateCustomerResponse>;
  findKybCustomerAndBusiness(country: string): Promise<AlfredpayKybCustomerAndBusiness[]>;
  getAlfredpayStatus(country: string): Promise<AlfredpayStatusResponse>;
  getKybRedirectLink(country: string): Promise<AlfredpayGetKybRedirectLinkResponse>;
  getKycRedirectLink(country: string): Promise<AlfredpayGetKycRedirectLinkResponse>;
  getKycStatus(country: string, type?: AlfredpayCustomerType): Promise<AlfredpayGetKycStatusResponse>;
  notifyKycRedirectFinished(country: string, type?: AlfredpayCustomerType): Promise<{ success: boolean }>;
  notifyKycRedirectOpened(country: string, type?: AlfredpayCustomerType): Promise<{ success: boolean }>;
  retryKyc(country: string, type?: AlfredpayCustomerType): Promise<AlfredpayGetKycRedirectLinkResponse>;
  sendKybSubmission(country: string, submissionId: string): Promise<void>;
  sendKycSubmission(country: string, submissionId: string): Promise<void>;
  submitKybFile(country: string, submissionId: string, fileType: string, file: File): Promise<void>;
  submitKybInformation(
    country: string,
    data: Omit<SubmitKybInformationRequest, "country">
  ): Promise<SubmitKybInformationResponse>;
  submitKybRelatedPersonFile(country: string, relatedPersonId: string, fileType: string, file: File): Promise<void>;
  submitKycFile(country: string, submissionId: string, fileType: string, file: File): Promise<void>;
  submitKycInformation(
    country: string,
    data: Omit<SubmitKycInformationRequest, "country">
  ): Promise<SubmitKycInformationResponse>;
}

export interface AlfredpayKycDeps {
  api: AlfredpayKycApi;
  /**
   * Opens the provider-hosted verification page. Only the redirect-link corridors (e.g. US) use
   * it; MX/CO/AR collect everything through the API. Injected so the package stays free of `window`
   * and each host can pick a new tab, a modal, or an iframe.
   */
  openVerificationUrl: (url: string) => void;
}
