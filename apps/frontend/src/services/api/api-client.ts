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

export class ApiError extends Error {
  status: number;
  data: { error?: string; message?: string; details?: string };

  constructor(status: number, data: { error?: string; message?: string; details?: string }, message: string) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
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
    const errorData = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    console.error("API Error:", errorData);
    const serverMessage = errorData.error ?? errorData.message ?? response.statusText;
    // Keep the message clean for the user; the endpoint/status prefix lives on `name` so Sentry
    // still groups by endpoint without leaking "POST /path (500):" into user-facing error text.
    const error = new ApiError(response.status, errorData, serverMessage);
    error.name = `ApiError ${method.toUpperCase()} ${path} (${response.status})`;
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
