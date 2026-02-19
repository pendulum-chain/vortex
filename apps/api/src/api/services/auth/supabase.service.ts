import logger from "../../../config/logger";
import { supabase, supabaseAdmin } from "../../../config/supabase";

// Supported BCP 47 locale values and their canonical forms.
// The Supabase email templates branch on `.Data.locale` using these values.
const LOCALE_MAP: Record<string, string> = {
  en: "en-US",
  "en-US": "en-US",
  "en-us": "en-US",
  pt: "pt-BR",
  "pt-BR": "pt-BR",
  "pt-br": "pt-BR"
};

const DEFAULT_LOCALE = "en-US";

/**
 * Normalizes an incoming locale string to a canonical BCP 47 value.
 * Unknown or missing values fall back to the default locale.
 */
function resolveLocale(locale?: string): { resolved: string; source: "request" | "default" } {
  if (locale && LOCALE_MAP[locale]) {
    return { resolved: LOCALE_MAP[locale], source: "request" };
  }
  return { resolved: DEFAULT_LOCALE, source: "default" };
}

export class SupabaseAuthService {
  /**
   * Check if user exists by email
   */
  static async checkUserExists(email: string): Promise<boolean> {
    try {
      // Query the profiles table directly for better performance
      const { data, error } = await supabaseAdmin.from("profiles").select("id").eq("email", email).single();

      if (error) {
        // If error is "PGRST116" (no rows returned), user doesn't exist
        if (error.code === "PGRST116") {
          return false;
        }
        throw error;
      }

      return !!data;
    } catch (error) {
      logger.error("Error checking user existence:", error);
      throw error;
    }
  }

  /**
   * Send OTP to email
   */
  static async sendOTP(email: string, locale?: string): Promise<void> {
    const { resolved: emailLocale, source: localeSource } = resolveLocale(locale);

    logger.debug(JSON.stringify({ emailLocale, event: "sendOTP", incomingLocale: locale ?? null, localeSource }));

    // Try updating the locale of existing users
    const { data: profileData } = await supabaseAdmin.from("profiles").select("id").eq("email", email).single();

    if (profileData?.id) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(profileData.id, {
        // Will overwrite only the `locale` field
        user_metadata: { locale: emailLocale }
      });

      if (updateError) {
        logger.error(
          JSON.stringify({
            emailLocale,
            error: updateError.message,
            event: "sendOTP",
            message: "failed to update user locale in metadata",
            userId: profileData.id
          })
        );
      } else {
        logger.debug(
          JSON.stringify({
            emailLocale,
            event: "sendOTP",
            message: "updated existing user locale in metadata",
            userId: profileData.id
          })
        );
      }
    }

    const options = {
      data: {
        locale: emailLocale
      },
      shouldCreateUser: true
    };

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options
    });

    if (error) {
      throw error;
    }
  }

  /**
   * Verify OTP
   */
  static async verifyOTP(
    email: string,
    token: string
  ): Promise<{
    access_token: string;
    refresh_token: string;
    user_id: string;
  }> {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email"
    });

    if (error) {
      throw error;
    }

    if (!data.session || !data.user) {
      throw new Error("No session returned after OTP verification");
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user_id: data.user.id
    };
  }

  /**
   * Verify access token
   */
  static async verifyToken(accessToken: string): Promise<{
    valid: boolean;
    user_id?: string;
  }> {
    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      return { valid: false };
    }

    return {
      user_id: data.user.id,
      valid: true
    };
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken: string): Promise<{
    access_token: string;
    refresh_token: string;
  }> {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (error || !data.session) {
      throw new Error("Failed to refresh token");
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    };
  }

  /**
   * Get user profile from Supabase
   */
  static async getUserProfile(userId: string): Promise<any> {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (error) {
      throw error;
    }

    return data.user;
  }
}
