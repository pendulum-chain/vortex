import { supabase } from "../config/supabase";

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
    return this.getTokens() !== null;
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
   * Refresh access token
   */
  static async refreshAccessToken(): Promise<AuthTokens | null> {
    const tokens = this.getTokens();
    if (!tokens) {
      return null;
    }

    try {
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: tokens.refreshToken
      });

      if (error || !data.session || !data.user) {
        this.clearTokens();
        return null;
      }

      const newTokens: AuthTokens = {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        userId: data.user.id
      };

      this.storeTokens(newTokens);
      return newTokens;
    } catch (error) {
      console.error("Token refresh failed:", error);
      this.clearTokens();
      return null;
    }
  }

  /**
   * Setup auto-refresh (refresh 5 minutes before expiry)
   */
  static setupAutoRefresh(): () => void {
    const REFRESH_INTERVAL = 55 * 60 * 1000; // 55 minutes

    const intervalId = setInterval(async () => {
      if (this.isAuthenticated()) {
        await this.refreshAccessToken();
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }

  /**
   * Sign out
   */
  static async signOut(): Promise<void> {
    await supabase.auth.signOut();
    this.clearTokens();
  }
}
