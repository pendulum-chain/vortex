import type { ZodType } from "zod";
import { MONERIUM_API_URL } from "../..";
import { ProviderHttpError } from "../providerHttpError";
import {
  moneriumAcceptedResponseSchema,
  moneriumAccessTokenResponseSchema,
  moneriumAddressSchema,
  moneriumCreateWebhookRequestSchema,
  moneriumIbanDestinationRequestSchema,
  moneriumIbanSchema,
  moneriumLinkAddressRequestSchema,
  moneriumListAddressesResponseSchema,
  moneriumListIbansResponseSchema,
  moneriumListOrdersResponseSchema,
  moneriumListProfilesResponseSchema,
  moneriumListWebhooksResponseSchema,
  moneriumOrderSchema,
  moneriumProfileSchema,
  moneriumRedeemOrderRequestSchema,
  moneriumUpdateWebhookRequestSchema,
  moneriumUploadedFileSchema,
  moneriumWebhookSubscriptionSchema
} from "./schemas";
import {
  MONERIUM_ADDRESS_OWNERSHIP_MESSAGE,
  type MoneriumAddress,
  type MoneriumChain,
  type MoneriumCreateOrderResult,
  type MoneriumCreateWebhookRequest,
  type MoneriumIban,
  type MoneriumIbanDestinationRequest,
  type MoneriumLinkAddressRequest,
  type MoneriumLinkAddressResult,
  type MoneriumListAddressesResponse,
  type MoneriumListIbansResponse,
  type MoneriumListOrdersResponse,
  type MoneriumListProfilesResponse,
  type MoneriumListWebhooksResponse,
  type MoneriumOrder,
  type MoneriumOrderFilterState,
  type MoneriumProfile,
  type MoneriumProfileKind,
  type MoneriumProfileState,
  type MoneriumRedeemOrderRequest,
  type MoneriumRequestIbanResult,
  type MoneriumUpdateWebhookRequest,
  type MoneriumUploadedFile,
  type MoneriumWebhookSubscription
} from "./types";

const API_V2_MEDIA_TYPE = "application/vnd.monerium.api-v2+json";
const REDACTED_PROVIDER_RESPONSE = "Sensitive provider response omitted";
const TOKEN_EXPIRY_SKEW_MS = 30_000;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set(["application/pdf", "image/jpeg"]);
export const MONERIUM_REQUEST_TIMEOUT_MS = 10_000;

type HttpMethod = "GET" | "PATCH" | "POST";

interface CachedAccessToken {
  expiresAt: number;
  value: string;
}

interface MoneriumHttpResult<T> {
  body: T;
  status: number;
}

export class MoneriumApiError extends ProviderHttpError {
  constructor(params: { status: number; endpoint: string; method: string }) {
    super({ ...params, provider: "monerium", responseBody: REDACTED_PROVIDER_RESPONSE });
  }
}

export class MoneriumContractError extends Error {
  public readonly providerContractViolation = true;

  constructor(operation: string) {
    super(`Monerium returned an invalid successful response for ${operation}`);
    this.name = "MoneriumContractError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** @see https://docs.monerium.com/whitelabel#link-wallet */
export function buildMoneriumWalletLinkMessage(): typeof MONERIUM_ADDRESS_OWNERSHIP_MESSAGE {
  return MONERIUM_ADDRESS_OWNERSHIP_MESSAGE;
}

/** @see https://docs.monerium.com/whitelabel#signing-an-order */
export function buildMoneriumSepaRedemptionMessage(amount: string, iban: string, timestamp: Date | string): string {
  const minute = timestamp instanceof Date ? `${timestamp.toISOString().slice(0, 16)}Z` : timestamp;
  return `Send EUR ${amount} to ${iban} at ${minute}`;
}

export class MoneriumApiService {
  private static instance: MoneriumApiService;

  private readonly baseUrl: string;

  private readonly clientId: string;

  private readonly clientSecret: string;

  private cachedToken: CachedAccessToken | undefined;

  private tokenPromise: Promise<CachedAccessToken> | undefined;

  private constructor() {
    if (typeof window !== "undefined") {
      throw new Error("MoneriumApiService is server-only");
    }
    const clientId = process.env.MONERIUM_WHITELABEL_CLIENT_ID;
    const clientSecret = process.env.MONERIUM_WHITELABEL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("MONERIUM_WHITELABEL_CLIENT_ID or MONERIUM_WHITELABEL_CLIENT_SECRET not defined");
    }
    this.baseUrl = MONERIUM_API_URL.replace(/\/$/, "");
    if (new URL(this.baseUrl).protocol !== "https:") {
      throw new Error("MONERIUM_API_URL must use https://");
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  public static getInstance(): MoneriumApiService {
    if (!MoneriumApiService.instance) {
      MoneriumApiService.instance = new MoneriumApiService();
    }
    return MoneriumApiService.instance;
  }

  private async acquireToken(): Promise<CachedAccessToken> {
    const endpoint = "/auth/token";
    const form = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "client_credentials"
    });
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, {
        body: form,
        headers: {
          Accept: API_V2_MEDIA_TYPE,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        method: "POST",
        signal: AbortSignal.timeout(MONERIUM_REQUEST_TIMEOUT_MS)
      });
    } catch {
      throw new MoneriumApiError({ endpoint, method: "POST", status: 0 });
    }
    if (!response.ok) {
      throw new MoneriumApiError({ endpoint, method: "POST", status: response.status });
    }

    let token;
    try {
      token = moneriumAccessTokenResponseSchema.parse(await this.readJson(response, endpoint, "POST"));
    } catch {
      throw new MoneriumContractError("POST /auth/token");
    }
    return {
      expiresAt: Date.now() + token.expires_in * 1_000,
      value: token.access_token
    };
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt - TOKEN_EXPIRY_SKEW_MS > Date.now()) {
      return this.cachedToken.value;
    }
    if (!this.tokenPromise) {
      this.tokenPromise = this.acquireToken().finally(() => {
        this.tokenPromise = undefined;
      });
    }
    this.cachedToken = await this.tokenPromise;
    return this.cachedToken.value;
  }

  private buildUrl(path: string, query?: Record<string, string | undefined>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private async fetchAuthenticated(
    path: string,
    method: HttpMethod,
    body?: unknown,
    query?: Record<string, string | undefined>
  ): Promise<Response> {
    const url = this.buildUrl(path, query);
    const serializedBody = body === undefined || body instanceof FormData ? body : JSON.stringify(body);
    let token = await this.getAccessToken();
    let response = await this.performFetch(url, path, method, token, serializedBody);
    if (response.status === 401) {
      if (this.cachedToken?.value === token) this.cachedToken = undefined;
      token = await this.getAccessToken();
      response = await this.performFetch(url, path, method, token, serializedBody);
    }
    return response;
  }

  private async performFetch(
    url: string,
    path: string,
    method: HttpMethod,
    token: string,
    body: BodyInit | undefined
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: API_V2_MEDIA_TYPE,
      Authorization: `Bearer ${token}`
    };
    if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";

    try {
      return await fetch(url, {
        body,
        headers,
        method,
        signal: AbortSignal.timeout(MONERIUM_REQUEST_TIMEOUT_MS)
      });
    } catch {
      throw new MoneriumApiError({ endpoint: this.redactEndpoint(path), method, status: 0 });
    }
  }

  private async request<T>(
    path: string,
    method: HttpMethod,
    options: {
      acceptedStatuses?: number[];
      body?: unknown;
      query?: Record<string, string | undefined>;
    } = {}
  ): Promise<MoneriumHttpResult<T>> {
    const response = await this.fetchAuthenticated(path, method, options.body, options.query);
    const acceptedStatuses = options.acceptedStatuses ?? [200];
    if (!acceptedStatuses.includes(response.status)) {
      throw new MoneriumApiError({ endpoint: this.redactEndpoint(path), method, status: response.status });
    }
    return {
      body: (response.status === 304 ? undefined : await this.readJson(response, path, method)) as T,
      status: response.status
    };
  }

  private async readJson(response: Response, endpoint: string, method: string): Promise<unknown> {
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      throw new MoneriumContractError(`${method} ${this.redactEndpoint(endpoint)}`);
    }
  }

  private redactEndpoint(path: string): string {
    return path
      .replace(/^\/profiles\/[^/]+$/, "/profiles/:profile")
      .replace(/^\/addresses\/[^/]+$/, "/addresses/:address")
      .replace(/^\/ibans\/[^/]+$/, "/ibans/:iban")
      .replace(/^\/orders\/[^/]+$/, "/orders/:order")
      .replace(/^\/webhooks\/[^/]+$/, "/webhooks/:subscription");
  }

  private parseResponse<T>(schema: ZodType<T>, body: unknown, operation: string): T {
    const result = schema.safeParse(body);
    if (!result.success) throw new MoneriumContractError(operation);
    return result.data;
  }

  public async listProfiles(filters: { kind?: MoneriumProfileKind; state?: MoneriumProfileState } = {}) {
    const response = await this.request<MoneriumListProfilesResponse>("/profiles", "GET", { query: filters });
    return this.parseResponse(moneriumListProfilesResponseSchema, response.body, "GET /profiles");
  }

  public async getProfile(profileId: string): Promise<MoneriumProfile> {
    const response = await this.request<MoneriumProfile>(`/profiles/${encodeURIComponent(profileId)}`, "GET");
    return this.parseResponse(moneriumProfileSchema, response.body, "GET /profiles/:profile");
  }

  public async listAddresses(filters: { chain?: MoneriumChain; profile?: string } = {}) {
    const response = await this.request<MoneriumListAddressesResponse>("/addresses", "GET", { query: filters });
    return this.parseResponse(moneriumListAddressesResponseSchema, response.body, "GET /addresses");
  }

  public async getAddress(address: string): Promise<MoneriumAddress> {
    const response = await this.request<MoneriumAddress>(`/addresses/${encodeURIComponent(address)}`, "GET");
    return this.parseResponse(moneriumAddressSchema, response.body, "GET /addresses/:address");
  }

  public async linkAddress(request: MoneriumLinkAddressRequest): Promise<MoneriumLinkAddressResult> {
    const body = moneriumLinkAddressRequestSchema.parse(request);
    const response = await this.request<unknown>("/addresses", "POST", {
      acceptedStatuses: [201, 202],
      body
    });
    if (response.status === 201) return { httpStatus: 201 };
    return {
      httpStatus: 202,
      ...this.parseResponse(moneriumAcceptedResponseSchema, response.body, "POST /addresses")
    };
  }

  public async listIbans(filters: { chain?: MoneriumChain; profile?: string } = {}) {
    const response = await this.request<MoneriumListIbansResponse>("/ibans", "GET", { query: filters });
    return this.parseResponse(moneriumListIbansResponseSchema, response.body, "GET /ibans");
  }

  public async getIban(iban: string): Promise<MoneriumIban> {
    const response = await this.request<MoneriumIban>(`/ibans/${encodeURIComponent(iban)}`, "GET");
    return this.parseResponse(moneriumIbanSchema, response.body, "GET /ibans/:iban");
  }

  public async requestIban(request: MoneriumIbanDestinationRequest): Promise<MoneriumRequestIbanResult> {
    const body = moneriumIbanDestinationRequestSchema.parse(request);
    const response = await this.request<unknown>("/ibans", "POST", {
      acceptedStatuses: [202, 304],
      body
    });
    return { httpStatus: response.status as 202 | 304 };
  }

  public async updateIbanDestination(iban: string, request: MoneriumIbanDestinationRequest): Promise<void> {
    const body = moneriumIbanDestinationRequestSchema.parse(request);
    await this.request(`/ibans/${encodeURIComponent(iban)}`, "PATCH", { body });
  }

  public async listOrders(
    filters: { address?: string; memo?: string; profile?: string; state?: MoneriumOrderFilterState; txHash?: string } = {}
  ): Promise<MoneriumListOrdersResponse> {
    const response = await this.request<MoneriumListOrdersResponse>("/orders", "GET", { query: filters });
    return this.parseResponse(moneriumListOrdersResponseSchema, response.body, "GET /orders");
  }

  public async getOrder(orderId: string): Promise<MoneriumOrder> {
    const response = await this.request<MoneriumOrder>(`/orders/${encodeURIComponent(orderId)}`, "GET");
    return this.parseResponse(moneriumOrderSchema, response.body, "GET /orders/:order");
  }

  public async createRedemptionOrder(request: MoneriumRedeemOrderRequest): Promise<MoneriumCreateOrderResult> {
    const body = moneriumRedeemOrderRequestSchema.parse(request);
    const response = await this.request<MoneriumOrder | unknown>("/orders", "POST", {
      acceptedStatuses: [200, 202],
      body
    });
    if (response.status === 200) {
      return { httpStatus: 200, order: this.parseResponse(moneriumOrderSchema, response.body, "POST /orders") };
    }
    return {
      httpStatus: 202,
      ...this.parseResponse(moneriumAcceptedResponseSchema, response.body, "POST /orders")
    };
  }

  public async uploadFile(file: Blob, fileName?: string): Promise<MoneriumUploadedFile> {
    const name = fileName ?? (file instanceof File ? file.name : "upload");
    if (name.length === 0 || name.length > 100) throw new Error("Monerium filenames must contain 1 to 100 characters");
    if (file.size > MAX_FILE_SIZE_BYTES) throw new Error("Monerium files must not exceed 5 MB");
    if (!ALLOWED_FILE_TYPES.has(file.type)) throw new Error("Monerium files must be PDF or JPEG");

    const form = new FormData();
    form.append("file", file, name);
    const response = await this.request<MoneriumUploadedFile>("/files", "POST", { body: form });
    return this.parseResponse(moneriumUploadedFileSchema, response.body, "POST /files");
  }

  public async createWebhook(request: MoneriumCreateWebhookRequest): Promise<MoneriumWebhookSubscription> {
    const body = moneriumCreateWebhookRequestSchema.parse(request);
    const response = await this.request<MoneriumWebhookSubscription>("/webhooks", "POST", {
      acceptedStatuses: [201],
      body
    });
    return this.parseResponse(moneriumWebhookSubscriptionSchema, response.body, "POST /webhooks");
  }

  public async listWebhooks(): Promise<MoneriumListWebhooksResponse> {
    const response = await this.request<MoneriumListWebhooksResponse>("/webhooks", "GET");
    return this.parseResponse(moneriumListWebhooksResponseSchema, response.body, "GET /webhooks");
  }

  public async updateWebhook(
    subscriptionId: string,
    request: MoneriumUpdateWebhookRequest
  ): Promise<MoneriumWebhookSubscription> {
    const body = moneriumUpdateWebhookRequestSchema.parse(request);
    const response = await this.request<MoneriumWebhookSubscription>(
      `/webhooks/${encodeURIComponent(subscriptionId)}`,
      "PATCH",
      { body }
    );
    return this.parseResponse(moneriumWebhookSubscriptionSchema, response.body, "PATCH /webhooks/:subscription");
  }
}
