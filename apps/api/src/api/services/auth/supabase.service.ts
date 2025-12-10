import { supabase, supabaseAdmin } from "../../../config/supabase";

export class SupabaseAuthService {
  /**
   * Check if user exists by email
   */
  static async checkUserExists(email: string): Promise<boolean> {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers();

      if (error) {
        throw error;
      }

      const userExists = data.users.some(user => user.email === email);
      return userExists;
    } catch (error) {
      console.error("Error checking user existence:", error);
      throw error;
    }
  }

  /**
   * Send OTP to email
   */
  static async sendOTP(email: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true
      }
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
