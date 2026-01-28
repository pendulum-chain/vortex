import { ALFREDPAY_API_KEY, ALFREDPAY_API_SECRET, ALFREDPAY_BASE_URL } from "../..";
import logger from "../../logger";
import {
  AlfredpayCustomerType,
  CreateAlfredpayCustomerResponse,
  FindAlfredpayCustomerResponse,
  GetKycRedirectLinkResponse,
  GetKycStatusResponse,
  GetKycSubmissionResponse
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

  private async executeRequest<T>(
    path: string,
    method: string,
    payload?: unknown,
    queryParams?: string
  ): Promise<T | undefined> {
    const headers = {
      Accept: "application/json",
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
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
    logger.current.info(`Sending request to ${fullUrl} with method ${method} and payload:`, payload);

    const response = await fetch(fullUrl, options);

    if (response.status === 401) {
      throw new Error("Authorization error.");
    }

    if (!response.ok) {
      throw new Error(`Request failed with status '${response.status}'. Error: ${await response.text()}`);
    }
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  public async createCustomer(type: AlfredpayCustomerType, country: string): Promise<CreateAlfredpayCustomerResponse> {
    const payload = {
      country,
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
}
