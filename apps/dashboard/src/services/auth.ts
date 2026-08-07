import { API_BASE_URL } from "./api/base-url";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
  userEmail?: string;
}

/** An active "log in as" session — opaque, non-renewable, valid 30 minutes. */
export interface ImpersonationSession {
  token: string;
  sessionId: string;
  expiresAt: string;
  targetEmail: string;
}

/**
 * Session storage + refresh, ported from the widget's AuthService. Keys are
 * dashboard-scoped so a widget session on the same origin is never reused.
 */
export class AuthService {
  private static readonly ACCESS_TOKEN_KEY = "vortex_dashboard_access_token";
  private static readonly REFRESH_TOKEN_KEY = "vortex_dashboard_refresh_token";
  private static readonly USER_ID_KEY = "vortex_dashboard_user_id";
  private static readonly USER_EMAIL_KEY = "vortex_dashboard_user_email";
  // One atomic record prevents readers from combining fields from different cross-tab writes.
  static readonly IMPERSONATION_STORAGE_KEY = "vortex_dashboard_impersonation_session";
  private static readonly LEGACY_IMPERSONATION_TOKEN_KEY = "vortex_dashboard_impersonation_token";
  private static readonly LEGACY_IMPERSONATION_SESSION_ID_KEY = "vortex_dashboard_impersonation_session_id";
  private static readonly LEGACY_IMPERSONATION_EXPIRES_AT_KEY = "vortex_dashboard_impersonation_expires_at";
  private static readonly LEGACY_IMPERSONATION_TARGET_EMAIL_KEY = "vortex_dashboard_impersonation_target_email";
  private static readonly impersonationListeners = new Set<() => void>();
  private static sessionGeneration = 0;
  private static refreshFlight: {
    generation: number;
    refreshToken: string;
    promise: Promise<AuthTokens | null>;
  } | null = null;

  static storeTokens(tokens: AuthTokens): void {
    this.sessionGeneration += 1;
    localStorage.setItem(this.ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, tokens.refreshToken);
    localStorage.setItem(this.USER_ID_KEY, tokens.userId);
    if (tokens.userEmail) {
      localStorage.setItem(this.USER_EMAIL_KEY, tokens.userEmail);
    }
  }

  static getTokens(): AuthTokens | null {
    const accessToken = localStorage.getItem(this.ACCESS_TOKEN_KEY);
    const refreshToken = localStorage.getItem(this.REFRESH_TOKEN_KEY);
    const userId = localStorage.getItem(this.USER_ID_KEY);
    const userEmail = localStorage.getItem(this.USER_EMAIL_KEY);

    if (!accessToken || !refreshToken || !userId) {
      return null;
    }
    return { accessToken, refreshToken, userEmail: userEmail || undefined, userId };
  }

  static clearTokens(): void {
    this.sessionGeneration += 1;
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.USER_ID_KEY);
    localStorage.removeItem(this.USER_EMAIL_KEY);
  }

  static storeImpersonationSession(session: ImpersonationSession): void {
    const previousSnapshot = this.getImpersonationSessionSnapshot();
    localStorage.setItem(
      this.IMPERSONATION_STORAGE_KEY,
      JSON.stringify({
        expiresAt: session.expiresAt,
        sessionId: session.sessionId,
        targetEmail: session.targetEmail,
        token: session.token
      })
    );
    this.clearLegacyImpersonationKeys();
    this.notifyImpersonationListeners(previousSnapshot);
  }

  static getImpersonationSession(): ImpersonationSession | null {
    return this.parseImpersonationSessionSnapshot(this.getImpersonationSessionSnapshot());
  }

  /** Stable serialized snapshot for `useSyncExternalStore`. Also reads complete legacy data. */
  static getImpersonationSessionSnapshot(): string | null {
    const current = localStorage.getItem(this.IMPERSONATION_STORAGE_KEY);
    if (current !== null) {
      return current;
    }

    const token = localStorage.getItem(this.LEGACY_IMPERSONATION_TOKEN_KEY);
    const sessionId = localStorage.getItem(this.LEGACY_IMPERSONATION_SESSION_ID_KEY);
    const expiresAt = localStorage.getItem(this.LEGACY_IMPERSONATION_EXPIRES_AT_KEY);
    const targetEmail = localStorage.getItem(this.LEGACY_IMPERSONATION_TARGET_EMAIL_KEY);
    return token && sessionId && expiresAt && targetEmail ? JSON.stringify({ expiresAt, sessionId, targetEmail, token }) : null;
  }

  static parseImpersonationSessionSnapshot(snapshot: string | null): ImpersonationSession | null {
    if (!snapshot) return null;
    try {
      const parsed = JSON.parse(snapshot) as Partial<ImpersonationSession>;
      if (
        typeof parsed.token !== "string" ||
        typeof parsed.sessionId !== "string" ||
        typeof parsed.expiresAt !== "string" ||
        !Number.isFinite(Date.parse(parsed.expiresAt)) ||
        typeof parsed.targetEmail !== "string"
      ) {
        return null;
      }
      return {
        expiresAt: parsed.expiresAt,
        sessionId: parsed.sessionId,
        targetEmail: parsed.targetEmail,
        token: parsed.token
      };
    } catch {
      return null;
    }
  }

  /** Same-tab writes notify directly; cross-tab writes arrive through the storage event. */
  static subscribeImpersonationSession(listener: () => void): () => void {
    this.impersonationListeners.add(listener);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || this.isImpersonationStorageKey(event.key)) {
        listener();
      }
    };
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("storage", handleStorage);
    }
    return () => {
      this.impersonationListeners.delete(listener);
      if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
        window.removeEventListener("storage", handleStorage);
      }
    };
  }

  static clearImpersonationSession(): void {
    const previousSnapshot = this.getImpersonationSessionSnapshot();
    localStorage.removeItem(this.IMPERSONATION_STORAGE_KEY);
    this.clearLegacyImpersonationKeys();
    this.notifyImpersonationListeners(previousSnapshot);
  }

  /** The bearer token requests should use: the impersonation token takes priority when active. */
  static getEffectiveAccessToken(): string | null {
    const impersonation = this.getImpersonationSession();
    if (impersonation) {
      return impersonation.token;
    }
    return this.getTokens()?.accessToken ?? null;
  }

  static isAuthenticated(): boolean {
    const tokens = this.getTokens();
    if (!tokens) {
      return false;
    }
    const expiryMs = this.decodeJwtExpiryMs(tokens.accessToken);
    return expiryMs === null || expiryMs > Date.now();
  }

  static getAccessTokenExpiryMs(): number | null {
    const tokens = this.getTokens();
    return tokens ? this.decodeJwtExpiryMs(tokens.accessToken) : null;
  }

  private static decodeJwtExpiryMs(token: string): number | null {
    try {
      const payload = token.split(".")[1];
      if (!payload) {
        return null;
      }
      // JWT segments are base64url and usually unpadded; convert to base64 and re-pad before decoding.
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
      const decoded = JSON.parse(atob(padded)) as { exp?: number };
      return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  /**
   * Refresh the access token via `/v1/auth/refresh`. Returns the new tokens, or `null`
   * when the current refresh token is confirmed invalid (401 — session cleared). A
   * superseded flight returns the replacement session instead. Transient failures throw so
   * callers can retry without destroying a still-valid session. Callers in the same session
   * share an in-flight refresh so proactive refresh and 401 recovery cannot race refresh-token
   * rotation; a replacement session starts its own flight.
   */
  static refreshAccessToken(): Promise<AuthTokens | null> {
    const tokens = this.getTokens();
    if (!tokens) {
      return Promise.resolve(null);
    }

    const generation = this.sessionGeneration;
    if (this.refreshFlight?.generation === generation && this.refreshFlight.refreshToken === tokens.refreshToken) {
      return this.refreshFlight.promise;
    }

    const promise = this.performTokenRefresh(tokens, generation).finally(() => {
      if (this.refreshFlight?.promise === promise) {
        this.refreshFlight = null;
      }
    });
    this.refreshFlight = { generation, promise, refreshToken: tokens.refreshToken };
    return promise;
  }

  private static async performTokenRefresh(tokens: AuthTokens, generation: number): Promise<AuthTokens | null> {
    const response = await fetch(`${API_BASE_URL}/v1/auth/refresh`, {
      body: JSON.stringify({ refresh_token: tokens.refreshToken }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(30000)
    });

    if (!this.isCurrentSession(tokens.refreshToken, generation)) {
      return this.getTokens();
    }
    if (response.status === 401) {
      this.clearTokens();
      return null;
    }
    if (!response.ok) {
      throw new Error(`Token refresh failed with status ${response.status}`);
    }

    const data = (await response.json()) as { access_token: string; refresh_token: string };
    if (!this.isCurrentSession(tokens.refreshToken, generation)) {
      return this.getTokens();
    }
    const newTokens: AuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      userEmail: tokens.userEmail,
      userId: tokens.userId
    };
    this.storeTokens(newTokens);
    return newTokens;
  }

  private static isCurrentSession(refreshToken: string, generation: number): boolean {
    return this.sessionGeneration === generation && this.getTokens()?.refreshToken === refreshToken;
  }

  static signOut(): void {
    this.clearImpersonationSession();
    this.clearTokens();
  }

  private static clearLegacyImpersonationKeys(): void {
    localStorage.removeItem(this.LEGACY_IMPERSONATION_TOKEN_KEY);
    localStorage.removeItem(this.LEGACY_IMPERSONATION_SESSION_ID_KEY);
    localStorage.removeItem(this.LEGACY_IMPERSONATION_EXPIRES_AT_KEY);
    localStorage.removeItem(this.LEGACY_IMPERSONATION_TARGET_EMAIL_KEY);
  }

  private static isImpersonationStorageKey(key: string): boolean {
    return [
      this.IMPERSONATION_STORAGE_KEY,
      this.LEGACY_IMPERSONATION_TOKEN_KEY,
      this.LEGACY_IMPERSONATION_SESSION_ID_KEY,
      this.LEGACY_IMPERSONATION_EXPIRES_AT_KEY,
      this.LEGACY_IMPERSONATION_TARGET_EMAIL_KEY
    ].includes(key);
  }

  private static notifyImpersonationListeners(previousSnapshot: string | null): void {
    if (this.getImpersonationSessionSnapshot() === previousSnapshot) return;
    for (const listener of this.impersonationListeners) {
      listener();
    }
  }
}
