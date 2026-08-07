export interface VortexSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

const STORAGE_KEY = "vortex_cdp_spike_session";
const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");
const apiUrl = import.meta.env.DEV ? "/__vortex-api" : configuredApiUrl;

function requireApiUrl(): string {
  if (!apiUrl) throw new Error("VITE_API_URL is not configured");
  return apiUrl;
}

function readExpiry(token: string): number | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="))) as {
      exp?: number;
    };
    return decoded.exp ? decoded.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

export function getSession(): VortexSession | undefined {
  const serialized = localStorage.getItem(STORAGE_KEY);
  if (!serialized) return undefined;
  try {
    return JSON.parse(serialized) as VortexSession;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return undefined;
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function requestOtp(email: string): Promise<void> {
  const response = await fetch(`${requireApiUrl()}/v1/auth/request-otp`, {
    body: JSON.stringify({ email }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  if (!response.ok) throw new Error(`OTP request failed (${response.status})`);
}

export async function verifyOtp(email: string, token: string): Promise<VortexSession> {
  const response = await fetch(`${requireApiUrl()}/v1/auth/verify-otp`, {
    body: JSON.stringify({ email, token }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  if (!response.ok) throw new Error(`OTP verification failed (${response.status})`);

  const body = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    user_id: string;
  };
  const session = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    userId: body.user_id
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export async function getFreshAccessToken(): Promise<string | undefined> {
  const session = getSession();
  if (!session) return undefined;

  const expiry = readExpiry(session.accessToken);
  if (!expiry || expiry > Date.now() + 120_000) return session.accessToken;

  const response = await fetch(`${requireApiUrl()}/v1/auth/refresh`, {
    body: JSON.stringify({ refresh_token: session.refreshToken }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  if (!response.ok) throw new Error(`Token refresh failed (${response.status})`);

  const body = (await response.json()) as { access_token: string; refresh_token: string };
  const refreshed = {
    ...session,
    accessToken: body.access_token,
    refreshToken: body.refresh_token
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(refreshed));
  return refreshed.accessToken;
}
