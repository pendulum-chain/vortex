import { MYKOBO_ACCESS_KEY, MYKOBO_BASE_URL, MYKOBO_CLIENT_DOMAIN, MYKOBO_SECRET_KEY } from "../..";
import { isProduction } from "../../helpers/environment";
import logger from "../../logger";
import {
  MykoboAuthTokenResponse,
  MykoboCreateIntentRequest,
  MykoboCreateIntentResponse,
  MykoboFeeKind,
  MykoboFeeResponse,
  MykoboGetProfileResponse,
  MykoboGetTransactionResponse,
  MykoboLookupFeesParams
} from "./types";

export class MykoboApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = "MykoboApiError";
    this.status = status;
    this.body = body;
  }
}

interface CachedToken {
  token: string;
  refreshToken: string;
}

export class MykoboApiService {
  private static instance: MykoboApiService;

  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly clientDomain?: string;

  private cachedToken: CachedToken | undefined;

  private tokenPromise: Promise<CachedToken> | undefined;

  private authFailurePromise: Promise<string> | undefined;

  private constructor() {
    if (!MYKOBO_ACCESS_KEY || !MYKOBO_SECRET_KEY) {
      throw new Error("MYKOBO_ACCESS_KEY or MYKOBO_SECRET_KEY not defined");
    }
    if (!MYKOBO_BASE_URL) {
      throw new Error("MYKOBO_BASE_URL not defined");
    }
    this.accessKey = MYKOBO_ACCESS_KEY;
    this.secretKey = MYKOBO_SECRET_KEY;
    const trimmedBase = MYKOBO_BASE_URL.replace(/\/$/, "");
    assertSecureMykoboBaseUrl(trimmedBase);
    this.baseUrl = /\/v\d+$/.test(trimmedBase) ? trimmedBase : `${trimmedBase}/v1`;
    this.clientDomain = MYKOBO_CLIENT_DOMAIN || undefined;
  }

  public static getInstance(): MykoboApiService {
    if (!MykoboApiService.instance) {
      MykoboApiService.instance = new MykoboApiService();
    }
    return MykoboApiService.instance;
  }

  public getClientDomain(): string | undefined {
    return this.clientDomain;
  }

  private async acquireToken(): Promise<CachedToken> {
    const response = await fetch(`${this.baseUrl}/auth/token`, {
      body: JSON.stringify({ access_key: this.accessKey, secret_key: this.secretKey }),
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      method: "POST"
    });
    if (!response.ok) {
      const body = await safeReadBody(response);
      throw new MykoboApiError(response.status, body, `Mykobo /auth/token failed: ${response.status}`);
    }
    const parsed = (await response.json()) as MykoboAuthTokenResponse;
    return { refreshToken: parsed.refresh_token, token: parsed.token };
  }

  private async refreshAccessToken(refreshToken: string): Promise<CachedToken> {
    const response = await fetch(`${this.baseUrl}/auth/refresh`, {
      body: JSON.stringify({ refresh_token: refreshToken }),
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      method: "POST"
    });
    if (!response.ok) {
      const body = await safeReadBody(response);
      throw new MykoboApiError(response.status, body, `Mykobo /auth/refresh failed: ${response.status}`);
    }
    const parsed = (await response.json()) as MykoboAuthTokenResponse;
    return { refreshToken: parsed.refresh_token, token: parsed.token };
  }

  private async getToken(): Promise<string> {
    if (this.cachedToken) {
      return this.cachedToken.token;
    }
    if (!this.tokenPromise) {
      this.tokenPromise = this.acquireToken().finally(() => {
        this.tokenPromise = undefined;
      });
    }
    this.cachedToken = await this.tokenPromise;
    return this.cachedToken.token;
  }

  private async handleAuthFailure(): Promise<string> {
    if (!this.authFailurePromise) {
      this.authFailurePromise = this.doHandleAuthFailure().finally(() => {
        this.authFailurePromise = undefined;
      });
    }
    return this.authFailurePromise;
  }

  private async doHandleAuthFailure(): Promise<string> {
    if (this.cachedToken) {
      try {
        const refreshed = await this.refreshAccessToken(this.cachedToken.refreshToken);
        this.cachedToken = refreshed;
        return refreshed.token;
      } catch (error) {
        logger.current.warn("Mykobo refresh failed; re-acquiring token", error);
      }
    }
    const reAcquired = await this.acquireToken();
    this.cachedToken = reAcquired;
    return reAcquired.token;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    options: { query?: Record<string, string | undefined>; body?: unknown } = {}
  ): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const body = options.body !== undefined ? JSON.stringify(options.body) : undefined;
    let token = await this.getToken();
    let response = await fetch(url, {
      body,
      headers: this.buildHeaders(token, body !== undefined),
      method
    });

    if (response.status === 401) {
      token = await this.handleAuthFailure();
      response = await fetch(url, {
        body,
        headers: this.buildHeaders(token, body !== undefined),
        method
      });
    }

    if (!response.ok) {
      const errorBody = await safeReadBody(response);
      throw new MykoboApiError(response.status, errorBody, `Mykobo ${method} ${path} failed: ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  private buildUrl(path: string, query?: Record<string, string | undefined>): string {
    const base = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    if (!query) return base;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") params.append(key, value);
    }
    const queryString = params.toString();
    return queryString ? `${base}?${queryString}` : base;
  }

  private buildHeaders(token: string, hasBody: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    };
    if (hasBody) headers["Content-Type"] = "application/json";
    return headers;
  }

  public async createTransactionIntent(request: MykoboCreateIntentRequest): Promise<MykoboCreateIntentResponse> {
    const body: MykoboCreateIntentRequest = {
      ...request,
      client_domain: request.client_domain ?? this.clientDomain
    };
    return this.request<MykoboCreateIntentResponse>("POST", "/transactions/intent", { body });
  }

  public async getTransaction(transactionId: string): Promise<MykoboGetTransactionResponse> {
    return this.request<MykoboGetTransactionResponse>("GET", `/transactions/${transactionId}`);
  }

  public async lookupFees(params: MykoboLookupFeesParams): Promise<MykoboFeeResponse> {
    return this.request<MykoboFeeResponse>("GET", "/fees", {
      query: {
        client_domain: params.client_domain ?? this.clientDomain,
        kind: params.kind,
        value: params.value
      }
    });
  }

  public async getProfileByWalletAddress(walletAddress: string, memo?: string): Promise<MykoboGetProfileResponse> {
    return this.request<MykoboGetProfileResponse>("GET", "/profiles", {
      query: { address: walletAddress, memo }
    });
  }

  public async getProfileByEmail(email: string, memo?: string): Promise<MykoboGetProfileResponse> {
    return this.request<MykoboGetProfileResponse>("GET", "/profiles", {
      query: { email, memo }
    });
  }

  public async createProfile(formData: FormData): Promise<MykoboGetProfileResponse> {
    const url = this.buildUrl("/profiles");
    let token = await this.getToken();
    let response = await fetch(url, {
      body: formData,
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      method: "POST"
    });

    if (response.status === 401) {
      token = await this.handleAuthFailure();
      response = await fetch(url, {
        body: formData,
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        method: "POST"
      });
    }

    if (!response.ok) {
      const errorBody = await safeReadBody(response);
      throw new MykoboApiError(response.status, errorBody, `Mykobo POST /profiles failed: ${response.status}`);
    }

    return (await response.json()) as MykoboGetProfileResponse;
  }

  public defaultWithdrawFee(value: string): Promise<MykoboFeeResponse> {
    return this.lookupFees({ kind: MykoboFeeKind.WITHDRAW, value });
  }

  public defaultDepositFee(value: string): Promise<MykoboFeeResponse> {
    return this.lookupFees({ kind: MykoboFeeKind.DEPOSIT, value });
  }
}

async function safeReadBody(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    try {
      return await response.text();
    } catch {
      return undefined;
    }
  }
}

function assertSecureMykoboBaseUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`MYKOBO_BASE_URL is not a valid URL: ${rawUrl}`);
  }
  if (parsed.protocol === "https:") return;
  if (parsed.protocol === "http:" && !isProduction() && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) {
    return;
  }
  throw new Error(`MYKOBO_BASE_URL must use https:// (got ${parsed.protocol}//${parsed.hostname})`);
}
