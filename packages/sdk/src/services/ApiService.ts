import type {
  CreateQuoteRequest,
  QuoteResponse,
  RampProcess,
  RegisterRampRequest,
  RegisterRampResponse,
  StartRampRequest,
  StartRampResponse,
  UpdateRampRequest,
  UpdateRampResponse
} from "@packages/shared";
import { handleAPIResponse } from "../errors";
import type { BrlaKycResponse } from "../types";

export class ApiService {
  constructor(private readonly apiBaseUrl: string) {}

  async createQuote(request: CreateQuoteRequest): Promise<QuoteResponse> {
    console.log("Creating quote with request:", request);
    const response = await fetch(`${this.apiBaseUrl}/v1/quotes`, {
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    return handleAPIResponse<QuoteResponse>(response, "/v1/quotes");
  }

  async getQuote(quoteId: string): Promise<QuoteResponse> {
    const response = await fetch(`${this.apiBaseUrl}/v1/quotes/${quoteId}`, {
      headers: {
        "Content-Type": "application/json"
      },
      method: "GET"
    });

    return handleAPIResponse<QuoteResponse>(response, `/v1/quotes/${quoteId}`);
  }

  async registerRamp(request: RegisterRampRequest): Promise<RegisterRampResponse> {
    const response = await fetch(`${this.apiBaseUrl}/v1/ramp/register`, {
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    return handleAPIResponse<RegisterRampResponse>(response, "/v1/ramp/register");
  }

  async updateRamp(request: UpdateRampRequest): Promise<UpdateRampResponse> {
    const response = await fetch(`${this.apiBaseUrl}/v1/ramp/update`, {
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    return handleAPIResponse<UpdateRampResponse>(response, "/v1/ramp/update");
  }

  async startRamp(request: StartRampRequest): Promise<StartRampResponse> {
    const response = await fetch(`${this.apiBaseUrl}/v1/ramp/start`, {
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    return handleAPIResponse<StartRampResponse>(response, "/v1/ramp/start");
  }

  async getRampStatus(rampId: string): Promise<RampProcess> {
    const url = new URL(`${this.apiBaseUrl}/v1/ramp/${rampId}`);
    const response = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json"
      },
      method: "GET"
    });

    return handleAPIResponse<RampProcess>(response, `/v1/ramp/status?id=${rampId}`);
  }

  async getBrlaKycStatus(taxId: string): Promise<BrlaKycResponse> {
    const url = new URL(`${this.apiBaseUrl}/v1/brla/getUser`);
    url.searchParams.append("taxId", taxId);

    const response = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json"
      },
      method: "GET"
    });

    return handleAPIResponse<BrlaKycResponse>(response, "/v1/brla/getUser");
  }
}
