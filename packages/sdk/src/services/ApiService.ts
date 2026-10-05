import type {
  CreateQuoteRequest,
  DomesticCountry,
  DomesticFiatAccount,
  GetRampInfoResponse,
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
import { handleAPIResponse } from "../errors.js";
import type { AccessTokenProvider } from "../types.js";

export class ApiService {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly publicKey?: string,
    private readonly secretKey?: string,
    private readonly accessTokenProvider?: AccessTokenProvider
  ) {}

  private async buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (this.publicKey) {
      headers["X-Public-Key"] = this.publicKey;
    }
    if (this.secretKey) {
      headers["X-API-Key"] = this.secretKey;
    } else if (this.accessTokenProvider) {
      const accessToken = await this.accessTokenProvider();
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
    }
    return headers;
  }

  /**
   * `endpoint` is the label handleAPIResponse reports in error messages; it defaults to `path`.
   */
  private async request<T>(
    method: "GET" | "POST",
    path: string,
    options: { body?: unknown; endpoint?: string } = {}
  ): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
      headers: await this.buildHeaders(),
      method
    });

    return handleAPIResponse<T>(response, options.endpoint ?? path);
  }

  async createQuote(request: CreateQuoteRequest): Promise<QuoteResponse> {
    return this.request("POST", "/v1/quotes", { body: request });
  }

  async getQuote(quoteId: string): Promise<QuoteResponse> {
    return this.request("GET", `/v1/quotes/${quoteId}`);
  }

  async registerRamp(request: RegisterRampRequest): Promise<RegisterRampResponse> {
    return this.request("POST", "/v1/ramp/register", { body: request });
  }

  async updateRamp(request: UpdateRampRequest): Promise<UpdateRampResponse> {
    return this.request("POST", "/v1/ramp/update", { body: request });
  }

  async startRamp(request: StartRampRequest): Promise<StartRampResponse> {
    return this.request("POST", "/v1/ramp/start", { body: request });
  }

  async getRampStatus(rampId: string): Promise<GetRampStatusResponse> {
    return this.request("GET", `/v1/ramp/${rampId}`, { endpoint: `/v1/ramp/status?id=${rampId}` });
  }

  async getRampInfo(): Promise<GetRampInfoResponse> {
    return this.request("GET", "/v1/ramp-info");
  }

  async getBrlRemainingLimit(taxId: string | undefined, direction: RampDirection): Promise<{ remainingLimit: number }> {
    const query = new URLSearchParams();
    if (taxId) {
      query.append("taxId", taxId);
    }
    query.append("direction", direction);

    return this.request("GET", `/v1/brla/getUserRemainingLimit?${query}`, { endpoint: "/v1/brla/getUserRemainingLimit" });
  }

  async validateBrlPixKey(pixKey: string): Promise<{ valid: boolean }> {
    const query = new URLSearchParams({ pixKey });

    return this.request("GET", `/v1/brla/validatePixKey?${query}`, { endpoint: "/v1/brla/validatePixKey" });
  }

  async listDomesticFiatAccounts(country: DomesticCountry): Promise<DomesticFiatAccount[]> {
    const query = new URLSearchParams({ country });

    return this.request("GET", `/v1/domestic/fiatAccounts?${query}`, {
      endpoint: `/v1/domestic/fiatAccounts?country=${country}`
    });
  }
}
