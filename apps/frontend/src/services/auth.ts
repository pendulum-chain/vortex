import { supabase } from "../config/supabase";
import { SIGNING_SERVICE_URL } from "../constants/constants";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
  userEmail?: string;
}

export class AuthService {
  private static readonly ACCESS_TOKEN_KEY = "vortex_access_token";
  private static readonly REFRESH_TOKEN_KEY = "vortex_refresh_token";
  private static readonly USER_ID_KEY = "vortex_user_id";
  private static readonly USER_EMAIL_KEY = "vortex_user_email";

  /**
   * Store tokens in localStorage
   *
   * Security Note: Storing tokens in localStorage makes them vulnerable to XSS attacks.
   * For production applications, consider using httpOnly cookies or implementing additional
   * security measures such as Content Security Policy headers and token encryption.
   * The current implementation prioritizes user experience and ease of integration.
   */
  static storeTokens(tokens: AuthTokens): void {
    localStorage.setItem(this.ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, tokens.refreshToken);
    localStorage.setItem(this.USER_ID_KEY, tokens.userId);
    if (tokens.userEmail) {
      localStorage.setItem(this.USER_EMAIL_KEY, tokens.userEmail);
    }
  }

  /**
   * Get tokens from localStorage
   */
  static getTokens(): AuthTokens | null {
    const access_token = localStorage.getItem(this.ACCESS_TOKEN_KEY);
    const refresh_token = localStorage.getItem(this.REFRESH_TOKEN_KEY);
    const user_id = localStorage.getItem(this.USER_ID_KEY);
    const user_email = localStorage.getItem(this.USER_EMAIL_KEY);

    if (!access_token || !refresh_token || !user_id) {
      return null;
    }

    return { accessToken: access_token, refreshToken: refresh_token, userEmail: user_email || undefined, userId: user_id };
  }

  /**
   * Clear tokens from localStorage
   */
  static clearTokens(): void {
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.USER_ID_KEY);
    localStorage.removeItem(this.USER_EMAIL_KEY);
  }

  /**
   * Check if user is authenticated
   */
  static isAuthenticated(): boolean {
    const tokens = this.getTokens();
    if (!tokens) {
      return false;
    }
    const expiryMs = this.getAccessTokenExpiryMs();
    return expiryMs === null || expiryMs > Date.now();
  }

  /**
   * Returns the access token expiry as epoch milliseconds, or null if it can't be decoded.
   */
  static getAccessTokenExpiryMs(): number | null {
    const tokens = this.getTokens();
    if (!tokens) {
      return null;
    }
    return this.decodeJwtExpiryMs(tokens.accessToken);
  }

  private static decodeJwtExpiryMs(token: string): number | null {
    try {
      const payload = token.split(".")[1];
      if (!payload) {
        return null;
      }
      const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
      return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  /**
   * Get user ID
   */
  static getUserId(): string | null {
    return localStorage.getItem(this.USER_ID_KEY);
  }

  /**
   * Handle tokens from URL (for magic link callback)
   * Returns the tokens from the URL hash if present, otherwise null.
   * Note: These are raw URL tokens; the caller should use them to set up
   * the Supabase session and get the full user details.
   */
  static handleUrlTokens(): { accessToken: string; refreshToken: string } | null {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    if (access_token && refresh_token) {
      return { accessToken: access_token, refreshToken: refresh_token };
    }

    return null;
  }

  /**
   * Refresh the access token via the backend `/auth/refresh` endpoint.
   *
   * Returns the new tokens on success, or `null` when the refresh token is confirmed
   * invalid/revoked (a 401 from the backend) — in which case the session is cleared.
   * Transient failures (network errors, timeouts, 5xx) throw so callers can retry
   * without destroying a still-valid session.
   */
  static async refreshAccessToken(): Promise<AuthTokens | null> {
    const tokens = this.getTokens();
    if (!tokens) {
      return null;
    }

    const response = await fetch(`${SIGNING_SERVICE_URL}/v1/auth/refresh`, {
      body: JSON.stringify({ refresh_token: tokens.refreshToken }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(30000)
    });

    // A 401 means the refresh token itself is invalid/revoked: the session is dead.
    if (response.status === 401) {
      this.clearTokens();
      return null;
    }

    // Any other non-OK status is transient — keep the session and let the caller retry.
    if (!response.ok) {
      throw new Error(`Token refresh failed with status ${response.status}`);
    }

    const data = (await response.json()) as { access_token: string; refresh_token: string };

    // The refresh endpoint does not return identity; it is unchanged across a refresh.
    const newTokens: AuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      userEmail: tokens.userEmail,
      userId: tokens.userId
    };

    this.storeTokens(newTokens);
    return newTokens;
  }

  /**
   * Sign out
   */
  static async signOut(): Promise<void> {
    await supabase.auth.signOut();
    this.clearTokens();
  }
}
