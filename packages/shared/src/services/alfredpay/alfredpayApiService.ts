import Big from "big.js";
import { ALFREDPAY_API_KEY, ALFREDPAY_API_SECRET, ALFREDPAY_BASE_URL } from "../..";
import logger from "../../logger";
import {
  AlfredpayCustomerType,
  AlfredpayFee,
  AlfredpayFiatAccountFields,
  AlfredpayFiatAccountType,
  AlfredpayFiatCurrency,
  AlfredpayKybFileType,
  AlfredpayKybRelatedPersonFileType,
  AlfredpayKycFileType,
  AlfredpayOfframpQuote,
  AlfredpayOnrampQuote,
  AlfredpayTradeLimitError,
  CreateAlfredpayCustomerResponse,
  CreateAlfredpayFiatAccountRequest,
  CreateAlfredpayFiatAccountResponse,
  CreateAlfredpayOfframpQuoteRequest,
  CreateAlfredpayOfframpRequest,
  CreateAlfredpayOfframpResponse,
  CreateAlfredpayOnrampQuoteRequest,
  CreateAlfredpayOnrampRequest,
  CreateAlfredpayOnrampResponse,
  FindAlfredpayCustomerResponse,
  GetAlfredpayOnrampTransactionResponse,
  GetKybRedirectLinkResponse,
  GetKybStatusResponse,
  GetKybSubmissionResponse,
  GetKycRedirectLinkResponse,
  GetKycStatusResponse,
  GetKycSubmissionResponse,
  ListAlfredpayFiatAccountsResponse,
  RetryKybSubmissionResponse,
  RetryKycSubmissionResponse,
  SubmitKybInformationRequest,
  SubmitKybInformationResponse,
  SubmitKycInformationRequest,
  SubmitKycInformationResponse
} from "./types";

export class AlfredpayApiService {
  private static instance: AlfredpayApiService;

  private apiKey: string;

  private apiSecret: string;

  private constructor() {
    if (!ALFREDPAY_API_KEY || !ALFREDPAY_API_SECRET) {
      throw new Error("ALFREDPAY_API_KEY or ALFREDPAY_API_SECRET not defined");
    }
    this.apiKey = ALFREDPAY_API_KEY;
    this.apiSecret = ALFREDPAY_API_SECRET;
  }

  public static getInstance(): AlfredpayApiService {
    if (!AlfredpayApiService.instance) {
      AlfredpayApiService.instance = new AlfredpayApiService();
    }
    return AlfredpayApiService.instance;
  }

  public static sumFeesByCurrency(fees: AlfredpayFee[], currency: AlfredpayFiatCurrency): Big {
    return fees.filter(fee => fee.currency === currency).reduce((total, fee) => total.plus(new Big(fee.amount)), new Big(0));
  }

  private async executeRequest<T>(
    path: string,
    method: string,
    payload?: unknown,
    queryParams?: string
  ): Promise<T | undefined> {
    const headers = {
      Accept: "application/json",
      "api-key": this.apiKey,
      "api-secret": this.apiSecret,
      "Content-Type": "application/json"
    };

    let url = path;

    if (queryParams) {
      url += `?${queryParams}`;
    }

    const options: RequestInit = {
      headers,
      method
    };

    if (payload !== undefined) {
      options.body = JSON.stringify(payload);
    }
    const fullUrl = `${ALFREDPAY_BASE_URL}${url}`;
    logger.current.debug(`Sending request to ${fullUrl} with method ${method} and payload:`, payload);

    const response = await fetch(fullUrl, options);

    if (response.status === 401) {
      throw new Error("Authorization error.");
    }

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 409) {
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.errorCode === 111426 && parsed.errorMetadata) {
            const { minQuantity, fromCurrency } = parsed.errorMetadata;
            throw new AlfredpayTradeLimitError(minQuantity, fromCurrency);
          }
        } catch (parseError) {
          if (parseError instanceof AlfredpayTradeLimitError) {
            throw parseError;
          }
        }
      }
      throw new Error(`Request failed with status '${response.status}'. Error: ${errorText}`);
    }
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  public async createCustomer(
    email: string,
    type: AlfredpayCustomerType,
    country: string
  ): Promise<CreateAlfredpayCustomerResponse> {
    const payload = {
      country,
      email,
      type
    };
    return (await this.executeRequest(
      "/api/v1/third-party-service/penny/customers/create",
      "POST",
      payload
    )) as CreateAlfredpayCustomerResponse;
  }

  public async findCustomer(email: string, country: string): Promise<FindAlfredpayCustomerResponse> {
    const encodedEmail = encodeURIComponent(email);
    const path = `/api/v1/third-party-service/penny/customers/find/${encodedEmail}/${country}`;
    return (await this.executeRequest(path, "GET")) as FindAlfredpayCustomerResponse;
  }

  public async getKycRedirectLink(customerId: string, country: string): Promise<GetKycRedirectLinkResponse> {
    const path = `/api/v1/third-party-service/penny/customers/${customerId}/kyc/${country}/url`;
    return (await this.executeRequest(path, "GET")) as GetKycRedirectLinkResponse;
  }

  public async getKycStatus(customerId: string, submissionId: string): Promise<GetKycStatusResponse> {
    const path = `/api/v1/third-party-service/penny/customers/${customerId}/kyc/${submissionId}/status`;
    return (await this.executeRequest(path, "GET")) as GetKycStatusResponse;
  }

  public async getLastKycSubmission(customerId: string): Promise<GetKycSubmissionResponse> {
    const path = `/api/v1/third-party-service/penny/customers/kyc/${customerId}`;
    return (await this.executeRequest(path, "GET")) as GetKycSubmissionResponse;
  }

  public async retryKycSubmission(customerId: string, submissionId: string): Promise<RetryKycSubmissionResponse> {
    const path = `/api/v1/third-party-service/penny/customers/${customerId}/kyc/${submissionId}/retry`;
    return (await this.executeRequest(path, "POST")) as RetryKycSubmissionResponse;
  }

  public async getKybRedirectLink(customerId: string): Promise<GetKybRedirectLinkResponse> {
    const path = `/api/v1/third-party-service/penny/customers/kyb/${customerId}/verification/url`;
    return (await this.executeRequest(path, "GET")) as GetKybRedirectLinkResponse;
  }

  public async getKybStatus(customerId: string, submissionId: string): Promise<GetKybStatusResponse> {
    const path = `/api/v1/third-party-service/penny/customers/${customerId}/kyb/${submissionId}/status`;
    return (await this.executeRequest(path, "GET")) as GetKybStatusResponse;
  }

  public async getLastKybSubmission(customerId: string): Promise<GetKybSubmissionResponse> {
    const path = `/api/v1/third-party-service/penny/customers/kyb/${customerId}`;
    return (await this.executeRequest(path, "GET")) as GetKybSubmissionResponse;
  }

  // Alfredpay has no dedicated KYB retry endpoint. Retry is handled by fetching a new verification URL.
  public async retryKybSubmission(_customerId: string, _submissionId: string): Promise<RetryKybSubmissionResponse> {
    return { message: "ok" };
  }

  public async createOnrampQuote(request: CreateAlfredpayOnrampQuoteRequest): Promise<AlfredpayOnrampQuote> {
    const path = "/api/v1/third-party-service/penny/quotes";
    return (await this.executeRequest(path, "POST", request)) as AlfredpayOnrampQuote;
  }

  public async createOfframpQuote(request: CreateAlfredpayOfframpQuoteRequest): Promise<AlfredpayOfframpQuote> {
    const path = "/api/v1/third-party-service/penny/quotes";
    return (await this.executeRequest(path, "POST", request)) as AlfredpayOfframpQuote;
  }

  public async getQuote(quoteId: string): Promise<AlfredpayOnrampQuote | AlfredpayOfframpQuote> {
    const path = `/api/v1/third-party-service/penny/quotes/${quoteId}`;
    return (await this.executeRequest(path, "GET")) as AlfredpayOnrampQuote | AlfredpayOfframpQuote;
  }

  public async createOnramp(request: CreateAlfredpayOnrampRequest): Promise<CreateAlfredpayOnrampResponse> {
    const path = "/api/v1/third-party-service/penny/onramp";
    return (await this.executeRequest(path, "POST", request)) as CreateAlfredpayOnrampResponse;
  }

  public async getOnrampTransaction(transactionId: string): Promise<GetAlfredpayOnrampTransactionResponse> {
    const path = `/api/v1/third-party-service/penny/onramp/${transactionId}`;
    return (await this.executeRequest(path, "GET")) as GetAlfredpayOnrampTransactionResponse;
  }

  public async createOfframp(request: CreateAlfredpayOfframpRequest): Promise<CreateAlfredpayOfframpResponse> {
    const path = "/api/v1/third-party-service/penny/offramp";
    return (await this.executeRequest(path, "POST", request)) as CreateAlfredpayOfframpResponse;
  }

  public async getOfframpTransaction(transactionId: string): Promise<CreateAlfredpayOfframpResponse> {
    const path = `/api/v1/third-party-service/penny/offramp/${transactionId}`;
    return (await this.executeRequest(path, "GET")) as CreateAlfredpayOfframpResponse;
  }

  public async createFiatAccount(
    customerId: string,
    type: AlfredpayFiatAccountType,
    fiatAccountFields: AlfredpayFiatAccountFields,
    isExternal: boolean
  ): Promise<CreateAlfredpayFiatAccountResponse> {
    const payload: CreateAlfredpayFiatAccountRequest = { customerId, fiatAccountFields, isExternal, type };
    const path = "/api/v1/third-party-service/penny/fiatAccounts";
    return (await this.executeRequest(path, "POST", payload)) as CreateAlfredpayFiatAccountResponse;
  }

  public async listFiatAccounts(customerId: string): Promise<ListAlfredpayFiatAccountsResponse> {
    const path = `/api/v1/third-party-service/penny/fiatAccounts?customerId=${encodeURIComponent(customerId)}`;
    return (await this.executeRequest(path, "GET")) as ListAlfredpayFiatAccountsResponse;
  }

  public async deleteFiatAccount(customerId: string, fiatAccountId: string): Promise<void> {
    const path = `/api/v1/third-party-service/penny/fiatAccounts/${encodeURIComponent(customerId)}/${encodeURIComponent(fiatAccountId)}`;
    await this.executeRequest(path, "DELETE");
  }

  public async submitKycInformation(
    customerId: string,
    data: SubmitKycInformationRequest
  ): Promise<SubmitKycInformationResponse> {
    const path = `/api/v1/third-party-service/penny/customers/${customerId}/kyc`;
    const kycSubmission: Record<string, unknown> = { ...data, nationalities: [data.country] };
    if (!data.typeDocument) delete kycSubmission.typeDocument;
    if (!data.typeDocumentCol) delete kycSubmission.typeDocumentCol;
    if (!data.phoneNumber) delete kycSubmission.phoneNumber;
    return (await this.executeRequest(path, "POST", { kycSubmission })) as SubmitKycInformationResponse;
  }

  public async submitKycFile(
    customerId: string,
    submissionId: string,
    fileType: AlfredpayKycFileType,
    file: Blob
  ): Promise<void> {
    const formData = new FormData();
    formData.append("fileBody", file);
    formData.append("fileType", fileType);

    const url = `${ALFREDPAY_BASE_URL}/api/v1/third-party-service/penny/customers/${customerId}/kyc/${submissionId}/files`;
    const response = await fetch(url, {
      body: formData,
      headers: {
        "api-key": this.apiKey,
        "api-secret": this.apiSecret
      },
      method: "POST"
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload KYC file: ${errorText}`);
    }
  }

  public async sendKycSubmission(customerId: string, submissionId: string): Promise<void> {
    const path = `/api/v1/third-party-service/penny/customers/${customerId}/kyc/${submissionId}/submit`;
    await this.executeRequest(path, "POST");
  }

  public async submitKybInformation(
    customerId: string,
    data: SubmitKybInformationRequest
  ): Promise<SubmitKybInformationResponse> {
    const path = `/api/v1/third-party-service/penny/customers/${customerId}/kyb`;
    return (await this.executeRequest(path, "POST", { kybSubmission: data })) as SubmitKybInformationResponse;
  }

  public async submitKybFiles(
    customerId: string,
    submissionId: string,
    fileType: AlfredpayKybFileType,
    file: Blob
  ): Promise<void> {
    const formData = new FormData();
    formData.append("rawBody", file);
    formData.append("fileType", fileType);

    const url = `${ALFREDPAY_BASE_URL}/api/v1/third-party-service/penny/customers/${customerId}/kyb/${submissionId}/files`;
    const response = await fetch(url, {
      body: formData,
      headers: {
        "api-key": this.apiKey,
        "api-secret": this.apiSecret
      },
      method: "POST"
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload KYB file: ${errorText}`);
    }
  }

  public async submitKybRelatedPersonFiles(
    customerId: string,
    relatedPersonId: string,
    fileType: AlfredpayKybRelatedPersonFileType,
    file: Blob
  ): Promise<void> {
    const formData = new FormData();
    formData.append("rawBody", file);
    formData.append("fileType", fileType);

    const url = `${ALFREDPAY_BASE_URL}/api/v1/third-party-service/penny/customers/${customerId}/kyb/${relatedPersonId}/files/relate-person`;
    const response = await fetch(url, {
      body: formData,
      headers: {
        "api-key": this.apiKey,
        "api-secret": this.apiSecret
      },
      method: "POST"
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload KYB related person file: ${errorText}`);
    }
  }

  public async sendKybSubmission(customerId: string, submissionId: string): Promise<void> {
    const path = `/api/v1/third-party-service/penny/customers/${customerId}/kyb/${submissionId}/submit`;
    await this.executeRequest(path, "PUT");
  }
}
