export interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface RampSnapshot {
  awaitingPayment?: boolean;
  createdAt: string;
  currentPhase: string;
  depositQrCode?: string;
  expiresAt: string;
  id: string;
  inputAmount: string;
  outputAmount: string;
  status?: string;
}

const AUTH_STORAGE_KEY = "vortex-demo-auth:v1";
const HISTORY_STORAGE_PREFIX = "vortex-demo-history:v2:";
const LEGACY_HISTORY_STORAGE_KEY = "vortex-demo-history:v1";
const MAX_HISTORY_ITEMS = 20;

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readJson(storage: StorageLike, key: string): unknown {
  try {
    const value = storage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: StorageLike, key: string, value: unknown): void {
  storage.setItem(key, JSON.stringify(value));
}

function isAuthTokens(value: unknown): value is AuthTokens {
  return isRecord(value) && typeof value.accessToken === "string" && typeof value.refreshToken === "string";
}

function isRampSnapshot(value: unknown): value is RampSnapshot {
  return (
    isRecord(value) &&
    (value.awaitingPayment === undefined || typeof value.awaitingPayment === "boolean") &&
    typeof value.createdAt === "string" &&
    typeof value.currentPhase === "string" &&
    (value.depositQrCode === undefined || typeof value.depositQrCode === "string") &&
    typeof value.expiresAt === "string" &&
    typeof value.id === "string" &&
    typeof value.inputAmount === "string" &&
    typeof value.outputAmount === "string" &&
    (value.status === undefined || typeof value.status === "string")
  );
}

function authUrl(apiBaseUrl: string, path: string): string {
  return `${apiBaseUrl.replace(/\/$/, "")}/v1/auth/${path}`;
}

async function postJson(fetcher: Fetcher, url: string, body: unknown): Promise<unknown> {
  const response = await fetcher(url, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Authentication request failed with status ${response.status}`);
  }

  return response.json();
}

function jwtPayload(accessToken: string): Record<string, unknown> | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const decoded = JSON.parse(atob(padded)) as unknown;
    return isRecord(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function jwtExpiresAt(accessToken: string): number | null {
  const exp = jwtPayload(accessToken)?.exp;
  return typeof exp === "number" ? exp * 1000 : null;
}

export function jwtSubject(accessToken: string): string | null {
  const sub = jwtPayload(accessToken)?.sub;
  return typeof sub === "string" && sub ? sub : null;
}

export function loadAuthTokens(storage: StorageLike): AuthTokens | null {
  const value = readJson(storage, AUTH_STORAGE_KEY);
  return isAuthTokens(value) && value.accessToken && value.refreshToken ? value : null;
}

export function storeAuthTokens(storage: StorageLike, tokens: AuthTokens): void {
  writeJson(storage, AUTH_STORAGE_KEY, tokens);
}

export function clearAuthTokens(storage: StorageLike): void {
  try {
    storage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private browsing.
  }
}

export async function requestOtp(apiBaseUrl: string, email: string, fetcher: Fetcher = fetch): Promise<void> {
  await postJson(fetcher, authUrl(apiBaseUrl, "request-otp"), { email });
}

export async function verifyOtp(
  apiBaseUrl: string,
  email: string,
  otp: string,
  storage: StorageLike,
  fetcher: Fetcher = fetch
): Promise<AuthTokens> {
  const value = await postJson(fetcher, authUrl(apiBaseUrl, "verify-otp"), { email, token: otp });
  if (!isRecord(value) || typeof value.access_token !== "string" || typeof value.refresh_token !== "string") {
    throw new Error("Authentication response did not include tokens");
  }

  const tokens = { accessToken: value.access_token, refreshToken: value.refresh_token };
  storeAuthTokens(storage, tokens);
  return tokens;
}

export function createAccessTokenProvider(
  apiBaseUrl: string,
  storage: StorageLike,
  fetcher: Fetcher = fetch
): () => Promise<string | null> {
  let refreshFlight: Promise<AuthTokens | null> | null = null;

  const refresh = async (): Promise<AuthTokens | null> => {
    const current = loadAuthTokens(storage);
    if (!current) return null;

    const response = await fetcher(authUrl(apiBaseUrl, "refresh"), {
      body: JSON.stringify({ refresh_token: current.refreshToken }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    if (response.status === 401) {
      clearAuthTokens(storage);
      return null;
    }
    if (!response.ok) {
      throw new Error(`Token refresh failed with status ${response.status}`);
    }

    const value = (await response.json()) as unknown;
    if (!isRecord(value) || typeof value.access_token !== "string" || typeof value.refresh_token !== "string") {
      throw new Error("Token refresh response did not include tokens");
    }

    const tokens = { accessToken: value.access_token, refreshToken: value.refresh_token };
    storeAuthTokens(storage, tokens);
    return tokens;
  };

  return async () => {
    const tokens = loadAuthTokens(storage);
    if (!tokens) return null;

    const expiresAt = jwtExpiresAt(tokens.accessToken);
    if (expiresAt !== null && expiresAt > Date.now() + 30_000) return tokens.accessToken;

    refreshFlight ??= refresh().finally(() => {
      refreshFlight = null;
    });
    return (await refreshFlight)?.accessToken ?? null;
  };
}

export function isTerminalRampStatus(status?: string): boolean {
  return status === "COMPLETE" || status === "FAILED";
}

function historyKey(subject: string): string {
  return `${HISTORY_STORAGE_PREFIX}${subject}`;
}

export function loadRampHistory(storage: StorageLike, subject: string): RampSnapshot[] {
  try {
    storage.removeItem(LEGACY_HISTORY_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private browsing.
  }
  const value = readJson(storage, historyKey(subject));
  if (!Array.isArray(value)) return [];
  return value.filter(isRampSnapshot).slice(0, MAX_HISTORY_ITEMS);
}

export function storeRampSnapshot(storage: StorageLike, subject: string, snapshot: RampSnapshot): RampSnapshot[] {
  const history = [snapshot, ...loadRampHistory(storage, subject).filter(item => item.id !== snapshot.id)].slice(
    0,
    MAX_HISTORY_ITEMS
  );
  writeJson(storage, historyKey(subject), history);
  return history;
}

export function markRampStarted(
  storage: StorageLike,
  subject: string,
  rampId: string,
  currentPhase: string,
  status?: string
): RampSnapshot[] {
  const history = loadRampHistory(storage, subject).map(item =>
    item.id === rampId ? { ...item, awaitingPayment: false, currentPhase, depositQrCode: undefined, status } : item
  );
  writeJson(storage, historyKey(subject), history);
  return history;
}

export function clearPendingPayment(storage: StorageLike, subject: string, rampId: string): RampSnapshot[] {
  const history = loadRampHistory(storage, subject).map(item =>
    item.id === rampId ? { ...item, awaitingPayment: false, depositQrCode: undefined } : item
  );
  writeJson(storage, historyKey(subject), history);
  return history;
}

export function updateRampSnapshots(
  storage: StorageLike,
  subject: string,
  updates: ReadonlyArray<Pick<RampSnapshot, "currentPhase" | "id" | "status">>
): RampSnapshot[] {
  const updatesById = new Map(updates.map(update => [update.id, update]));
  const history = loadRampHistory(storage, subject).map(item => {
    const update = updatesById.get(item.id);
    if (!update) return item;
    const leftPayment = item.awaitingPayment && (update.currentPhase !== "initial" || isTerminalRampStatus(update.status));
    return {
      ...item,
      awaitingPayment: leftPayment ? false : item.awaitingPayment,
      currentPhase: update.currentPhase,
      depositQrCode: leftPayment ? undefined : item.depositQrCode,
      status: update.status
    };
  });
  writeJson(storage, historyKey(subject), history);
  return history;
}

export async function reconcileRampStart(
  storage: StorageLike,
  subject: string,
  rampId: string,
  getStatus: (rampId: string) => Promise<{ currentPhase: unknown; status?: unknown }>
): Promise<RampSnapshot[] | null> {
  try {
    const current = await getStatus(rampId);
    if (String(current.currentPhase) === "initial") return null;
    return markRampStarted(
      storage,
      subject,
      rampId,
      String(current.currentPhase),
      current.status === undefined ? undefined : String(current.status)
    );
  } catch {
    // Keep the original start error; status reconciliation is best effort.
    return null;
  }
}
