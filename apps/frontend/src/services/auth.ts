import { supabase } from "../config/supabase";

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  user_id: string;
  user_email?: string;
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
    localStorage.setItem(this.ACCESS_TOKEN_KEY, tokens.access_token);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, tokens.refresh_token);
    localStorage.setItem(this.USER_ID_KEY, tokens.user_id);
    if (tokens.user_email) {
      localStorage.setItem(this.USER_EMAIL_KEY, tokens.user_email);
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

    return { access_token, refresh_token, user_email: user_email || undefined, user_id };
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
   * Returns null when tokens are found, as the actual user_id will be
   * fetched from the session in the calling code
   */
  static handleUrlTokens(): boolean {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    return !!(access_token && refresh_token);
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
        refresh_token: tokens.refresh_token
      });

      if (error || !data.session || !data.user) {
        this.clearTokens();
        return null;
      }

      const newTokens: AuthTokens = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_id: data.user.id
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
