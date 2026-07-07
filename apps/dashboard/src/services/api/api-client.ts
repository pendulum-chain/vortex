import { AuthService, type AuthTokens } from "../auth";
import { API_BASE_URL } from "./base-url";

// Single-flight token refresh: concurrent 401s share one refresh instead of each firing
// their own (which would race the refresh-token rotation and fail).
let refreshPromise: Promise<AuthTokens | null> | null = null;

function refreshTokenOnce(): Promise<AuthTokens | null> {
  if (!refreshPromise) {
    refreshPromise = AuthService.refreshAccessToken()
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

type Params = Record<string, string | number | boolean | undefined>;

async function apiFetch<T>(
  method: string,
  path: string,
  options: {
    data?: unknown;
    params?: Params;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const url = new URL(`${API_BASE_URL}/v1${path}`, window.location.origin);
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const body = options.data !== undefined ? JSON.stringify(options.data) : undefined;

  const doFetch = (accessToken: string | undefined) =>
    fetch(url.toString(), {
      body,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        "Content-Type": "application/json",
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
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: string | { message?: string; code?: string };
      message?: string;
    };
    // The backend uses both `{ error: "..." }` and `{ error: { code, message } }` shapes.
    const serverMessage =
      (typeof errorData.error === "string" ? errorData.error : errorData.error?.message) ??
      errorData.message ??
      response.statusText;
    throw new ApiError(
      response.status,
      { error: typeof errorData.error === "string" ? errorData.error : errorData.error?.message, message: errorData.message },
      serverMessage
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const apiClient = {
  delete: <T>(url: string, config?: { params?: Params }) => apiFetch<T>("DELETE", url, { params: config?.params }),
  get: <T>(url: string, config?: { params?: Params; signal?: AbortSignal }) =>
    apiFetch<T>("GET", url, { params: config?.params, signal: config?.signal }),
  patch: <T>(url: string, data?: unknown) => apiFetch<T>("PATCH", url, { data }),
  post: <T>(url: string, data?: unknown, config?: { headers?: Record<string, string>; params?: Params }) =>
    apiFetch<T>("POST", url, { data, headers: config?.headers, params: config?.params }),
  put: <T>(url: string, data?: unknown) => apiFetch<T>("PUT", url, { data })
};
