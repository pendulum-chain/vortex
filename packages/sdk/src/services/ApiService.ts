import type {
  AlfredPayCountry,
  AlfredpayFiatAccount,
  CreateQuoteRequest,
  GetRampStatusResponse,
  QuoteResponse,
  RampDirection,
  RegisterRampRequest,
  RegisterRampResponse,
  StartRampRequest,
  StartRampResponse,
  UpdateRampRequest,
  UpdateRampResponse
} from "@vortexfi/shared";
import { handleAPIResponse } from "../errors";
import type { BrlKycResponse } from "../types";

export class ApiService {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly secretKey?: string
  ) {}

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (this.secretKey) {
      headers["X-API-Key"] = this.secretKey;
    }
    return headers;
  }

  async createQuote(request: CreateQuoteRequest): Promise<QuoteResponse> {
    const response = await fetch(`${this.apiBaseUrl}/v1/quotes`, {
      body: JSON.stringify(request),
      headers: this.buildHeaders(),
      method: "POST"
    });

    return handleAPIResponse<QuoteResponse>(response, "/v1/quotes");
  }

  async getQuote(quoteId: string): Promise<QuoteResponse> {
    const response = await fetch(`${this.apiBaseUrl}/v1/quotes/${quoteId}`, {
      headers: this.buildHeaders(),
      method: "GET"
    });

    return handleAPIResponse<QuoteResponse>(response, `/v1/quotes/${quoteId}`);
  }

  async registerRamp(request: RegisterRampRequest): Promise<RegisterRampResponse> {
    const response = await fetch(`${this.apiBaseUrl}/v1/ramp/register`, {
      body: JSON.stringify(request),
      headers: this.buildHeaders(),
      method: "POST"
    });

    return handleAPIResponse<RegisterRampResponse>(response, "/v1/ramp/register");
  }

  async updateRamp(request: UpdateRampRequest): Promise<UpdateRampResponse> {
    const response = await fetch(`${this.apiBaseUrl}/v1/ramp/update`, {
      body: JSON.stringify(request),
      headers: this.buildHeaders(),
      method: "POST"
    });
    return handleAPIResponse<UpdateRampResponse>(response, "/v1/ramp/update");
  }

  async startRamp(request: StartRampRequest): Promise<StartRampResponse> {
    const response = await fetch(`${this.apiBaseUrl}/v1/ramp/start`, {
      body: JSON.stringify(request),
      headers: this.buildHeaders(),
      method: "POST"
    });

    return handleAPIResponse<StartRampResponse>(response, "/v1/ramp/start");
  }

  async getRampStatus(rampId: string): Promise<GetRampStatusResponse> {
    const url = new URL(`${this.apiBaseUrl}/v1/ramp/${rampId}`);
    const response = await fetch(url.toString(), {
      headers: this.buildHeaders(),
      method: "GET"
    });

    return handleAPIResponse<GetRampStatusResponse>(response, `/v1/ramp/status?id=${rampId}`);
  }

  async getBrlKycStatus(taxId?: string): Promise<BrlKycResponse> {
    const url = new URL(`${this.apiBaseUrl}/v1/brla/getUser`);
    if (taxId) {
      url.searchParams.append("taxId", taxId);
    }

    const response = await fetch(url.toString(), {
      headers: this.buildHeaders(),
      method: "GET"
    });

    return handleAPIResponse<BrlKycResponse>(response, "/v1/brla/getUser");
  }

  async getBrlRemainingLimit(taxId: string | undefined, direction: RampDirection): Promise<{ remainingLimit: number }> {
    const url = new URL(`${this.apiBaseUrl}/v1/brla/getUserRemainingLimit`);
    if (taxId) {
      url.searchParams.append("taxId", taxId);
    }
    url.searchParams.append("direction", direction);

    const response = await fetch(url.toString(), {
      headers: this.buildHeaders(),
      method: "GET"
    });

    return handleAPIResponse<{ remainingLimit: number }>(response, "/v1/brla/getUserRemainingLimit");
  }

  async validateBrlPixKey(pixKey: string): Promise<{ valid: boolean }> {
    const url = new URL(`${this.apiBaseUrl}/v1/brla/validatePixKey`);
    url.searchParams.append("pixKey", pixKey);

    const response = await fetch(url.toString(), {
      headers: this.buildHeaders(),
      method: "GET"
    });

    return handleAPIResponse<{ valid: boolean }>(response, "/v1/brla/validatePixKey");
  }

  async listAlfredpayFiatAccounts(country: AlfredPayCountry): Promise<AlfredpayFiatAccount[]> {
    const url = new URL(`${this.apiBaseUrl}/v1/alfredpay/fiatAccounts`);
    url.searchParams.append("country", country);

    const response = await fetch(url.toString(), {
      headers: this.buildHeaders(),
      method: "GET"
    });

    return handleAPIResponse<AlfredpayFiatAccount[]>(response, `/v1/alfredpay/fiatAccounts?country=${country}`);
  }
}
