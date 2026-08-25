import { AuthService, type AuthTokens } from "../auth";
import { API_BASE_URL } from "./base-url";

function refreshTokenOnce(): Promise<AuthTokens | null> {
  return AuthService.refreshAccessToken().catch(() => null);
}

let managedProfileAccessDeniedHandler: ((selectionSnapshot: string) => boolean | Promise<boolean>) | undefined;

export function setManagedProfileAccessDeniedHandler(
  handler: ((selectionSnapshot: string) => boolean | Promise<boolean>) | undefined
): void {
  managedProfileAccessDeniedHandler = handler;
}

export class ApiError extends Error {
  status: number;
  data: {
    code?: string;
    error?: string;
    message?: string;
    details?: string;
    fields?: Array<{ field: string; message: string }>;
  };

  constructor(
    status: number,
    data: {
      code?: string;
      error?: string;
      message?: string;
      details?: string;
      fields?: Array<{ field: string; message: string }>;
    },
    message: string
  ) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

type Params = Record<string, string | number | boolean | undefined>;
type RequestConfig = {
  managedProfile?: boolean;
  params?: Params;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

async function apiFetch<T>(
  method: string,
  path: string,
  options: {
    data?: unknown;
    params?: Params;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    managedProfile?: boolean;
  } = {}
): Promise<T> {
  const url = new URL(`${API_BASE_URL}/v1${path}`, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  // Document uploads post FormData; the browser must set its own multipart boundary.
  const isFormData = options.data instanceof FormData;
  const body = isFormData ? (options.data as FormData) : options.data !== undefined ? JSON.stringify(options.data) : undefined;

  const impersonationSnapshot = AuthService.getAcceptedImpersonationSessionSnapshot();
  const impersonation = AuthService.parseImpersonationSessionSnapshot(impersonationSnapshot);
  const initialTokens = AuthService.getTokens();
  const bearerProfileId = impersonation?.targetProfileId ?? initialTokens?.userId ?? null;
  const selectionSnapshot = options.managedProfile ? AuthService.getAcceptedManagedProfileSelectionSnapshot() : null;
  const selection = AuthService.parseManagedProfileSelectionSnapshot(selectionSnapshot);
  const managedProfileId = selection?.managerProfileId === bearerProfileId ? selection.targetProfileId : null;
  const initialAccessToken = impersonation?.token ?? initialTokens?.accessToken;

  const callerHeaders = Object.fromEntries(
    Object.entries(options.headers ?? {}).filter(
      ([key]) => !["authorization", "x-managed-profile-id"].includes(key.toLowerCase())
    )
  );
  const doFetch = (accessToken: string | undefined) =>
    fetch(url.toString(), {
      body,
      headers: {
        ...(!isFormData ? { "Content-Type": "application/json" } : {}),
        ...callerHeaders,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(managedProfileId ? { "X-Managed-Profile-Id": managedProfileId } : {})
      },
      method,
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)
    });

  let response = await doFetch(initialAccessToken);

  if (response.status === 401) {
    if (impersonation) {
      // Impersonation tokens are opaque and non-renewable — there is no refresh path.
      // Drop back to the operator's own (untouched) session instead of retrying.
      AuthService.clearImpersonationSession(impersonationSnapshot ?? undefined);
      throw new ApiError(401, {}, "Your impersonation session has expired. You're back in your own session.");
    }
    if (initialTokens?.accessToken) {
      const refreshed = await refreshTokenOnce();
      if (refreshed?.accessToken && refreshed.userId === initialTokens.userId) {
        response = await doFetch(refreshed.accessToken);
      }
    }
  }

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: string | { message?: string; code?: string };
      code?: string;
      fields?: Array<{ field: string; message: string }>;
      message?: string;
    };
    // The backend uses both `{ error: "..." }` and `{ error: { code, message } }` shapes.
    const serverMessage =
      (typeof errorData.error === "string" ? errorData.error : errorData.error?.message) ??
      errorData.message ??
      response.statusText;
    const code = errorData.code ?? (typeof errorData.error === "object" ? errorData.error.code : undefined);
    if (managedProfileId && response.status === 403 && code === "MANAGED_PROFILE_ACCESS_DENIED" && selectionSnapshot) {
      if (!(await managedProfileAccessDeniedHandler?.(selectionSnapshot))) {
        AuthService.clearManagedProfileSelection(selectionSnapshot);
      }
    }
    throw new ApiError(
      response.status,
      {
        code,
        error: typeof errorData.error === "string" ? errorData.error : errorData.error?.message,
        fields: errorData.fields,
        message: errorData.message
      },
      serverMessage
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const apiClient = {
  delete: <T>(url: string, config?: RequestConfig) =>
    apiFetch<T>("DELETE", url, { managedProfile: config?.managedProfile, params: config?.params }),
  get: <T>(url: string, config?: RequestConfig) =>
    apiFetch<T>("GET", url, { managedProfile: config?.managedProfile, params: config?.params, signal: config?.signal }),
  patch: <T>(url: string, data?: unknown, config?: RequestConfig) =>
    apiFetch<T>("PATCH", url, { data, managedProfile: config?.managedProfile }),
  post: <T>(url: string, data?: unknown, config?: RequestConfig) =>
    apiFetch<T>("POST", url, {
      data,
      headers: config?.headers,
      managedProfile: config?.managedProfile,
      params: config?.params
    }),
  put: <T>(url: string, data?: unknown, config?: RequestConfig) =>
    apiFetch<T>("PUT", url, { data, managedProfile: config?.managedProfile })
};
