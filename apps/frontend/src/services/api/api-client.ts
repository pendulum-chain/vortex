import { SIGNING_SERVICE_URL } from "../../constants/constants";
import { AuthService, type AuthTokens } from "../auth";

// Single-flight token refresh: concurrent 401s share one refresh instead of each firing
// their own (which would race the refresh-token rotation and fail).
let refreshPromise: Promise<AuthTokens | null> | null = null;

function refreshTokenOnce(): Promise<AuthTokens | null> {
  if (!refreshPromise) {
    refreshPromise = AuthService.refreshAccessToken()
      // A transient refresh failure shouldn't reject every waiting request; treat as "no new token".
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Named business areas used as the Sentry `domain` tag. API errors map to these by endpoint;
// unmapped endpoints fall through to their raw path segment (see getApiDomain).
export enum SentryDomain {
  Kyc = "kyc",
  Kyb = "kyb",
  Quote = "quote",
  Ramp = "ramp",
  Auth = "auth",
  Wallet = "wallet"
}

// Errors carrying a `domain` are tagged by business area in Sentry's beforeSend.
// Implemented by ApiError and SignRampError.
export interface DomainError {
  domain: string;
}

interface ApiErrorData {
  error?: string;
  message?: string;
  details?: string;
}

interface ApiErrorResponse extends Omit<ApiErrorData, "error"> {
  error?: string | { code?: string; message?: string; status?: number };
}

export function apiErrorMessage(error: ApiErrorResponse, fallback: string): string {
  return (typeof error.error === "string" ? error.error : error.error?.message) ?? error.message ?? fallback;
}

export class ApiError extends Error implements DomainError {
  status: number;
  data: ApiErrorData;
  domain: string;

  constructor(status: number, data: ApiErrorData, message: string, domain: string) {
    super(message);
    this.status = status;
    this.data = data;
    this.domain = domain;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

// Replace dynamic path segments (uuids, numeric ids, wallet addresses/long tokens) with ":id"
// so Sentry groups errors by endpoint instead of creating one issue per id. Also keeps
// addresses out of issue titles.
function normalizePath(path: string): string {
  // Split off any query string first so the last path segment is followed by end-of-string
  // (the `(?=\/|$)` lookaheads wouldn't match a segment trailed by "?"), and so query params —
  // which can carry ids/addresses — never reach the error message or Sentry issue title.
  const [rawPath, query] = path.split("?");
  const normalized = rawPath
    .replace(/\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?=\/|$)/g, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:id")
    .replace(/\/[A-Za-z0-9]{20,}(?=\/|$)/g, "/:id");
  return query === undefined ? normalized : `${normalized}?[Filtered]`;
}

const DOMAIN_BY_SEGMENT: Record<string, SentryDomain> = {
  alfredpay: SentryDomain.Kyc,
  brla: SentryDomain.Kyc,
  mykobo: SentryDomain.Kyc,
  quotes: SentryDomain.Quote,
  ramp: SentryDomain.Ramp,
  recipients: SentryDomain.Ramp,
  siwe: SentryDomain.Auth,
  subsidize: SentryDomain.Ramp
};

// Map an endpoint path to a business domain for Sentry tagging. Unmapped endpoints fall
// through to their raw path segment. Strip any query string first so params (which can carry
// ids/addresses) never leak into the domain tag when a caller inlines them in the path.
function getApiDomain(path: string): string {
  const pathWithoutQuery = path.split("?")[0];
  if (pathWithoutQuery.toLowerCase().includes("kyb")) return SentryDomain.Kyb;
  const segment = pathWithoutQuery.split("/").filter(Boolean)[0]?.toLowerCase() ?? "api";
  return DOMAIN_BY_SEGMENT[segment] ?? segment;
}

async function apiFetch<T>(
  method: string,
  path: string,
  options: {
    data?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const url = new URL(`${SIGNING_SERVICE_URL}/v1${path}`, window.location.origin);
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const isFormData = options.data instanceof FormData;
  const body = isFormData ? (options.data as FormData) : options.data !== undefined ? JSON.stringify(options.data) : undefined;

  const doFetch = (accessToken: string | undefined) =>
    fetch(url.toString(), {
      body,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(!isFormData ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      },
      method,
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)
    });

  const initialTokens = AuthService.getTokens();
  let response = await doFetch(initialTokens?.accessToken);

  if (response.status === 401 && initialTokens?.accessToken) {
    const refreshed = await refreshTokenOnce();
    if (refreshed?.accessToken) {
      response = await doFetch(refreshed.accessToken);
    }
  }

  if (!response.ok) {
    const responseError = (await response.json().catch(() => ({}))) as ApiErrorResponse;
    console.error("API Error:", responseError);
    const serverMessage = apiErrorMessage(responseError, response.statusText);
    const errorData: ApiErrorData = { ...responseError, error: serverMessage };
    // Keep the message clean for the user; the endpoint/status prefix lives on `name` so Sentry
    // still groups by endpoint (one issue per endpoint, not per id — hence normalizePath) without
    // leaking "POST /path (500):" into user-facing error text.
    const error = new ApiError(response.status, errorData, serverMessage, getApiDomain(path));
    error.name = `ApiError ${method.toUpperCase()} ${normalizePath(path)} (${response.status})`;
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const handleApiError = (error: unknown, defaultMessage = "An error occurred"): string => {
  if (isApiError(error)) {
    return error.data?.error ?? error.data?.message ?? error.message ?? defaultMessage;
  }
  return error instanceof Error ? error.message : defaultMessage;
};

export async function apiRequest<T>(
  method: "get" | "post" | "put" | "delete",
  url: string,
  data?: unknown,
  config?: {
    params?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  }
): Promise<T> {
  return apiFetch<T>(method, url, { data, ...config });
}

type Params = Record<string, string | number | boolean | undefined>;

export const apiClient = {
  delete: <T>(url: string, config?: { params?: Params }) => apiFetch<T>("DELETE", url, { params: config?.params }),
  get: <T>(url: string, config?: { params?: Params; signal?: AbortSignal }) =>
    apiFetch<T>("GET", url, { params: config?.params, signal: config?.signal }),
  post: <T>(url: string, data?: unknown, config?: { headers?: Record<string, string>; params?: Params }) =>
    apiFetch<T>("POST", url, { data, headers: config?.headers, params: config?.params }),
  put: <T>(url: string, data?: unknown) => apiFetch<T>("PUT", url, { data })
};
