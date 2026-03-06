import { apiClient } from "./api-client";

export interface CheckEmailResponse {
  exists: boolean;
  action: "signin" | "signup";
}

export interface VerifyOTPResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  userId: string;
}

export class AuthAPI {
  /**
   * Check if email exists
   */
  static async checkEmail(email: string): Promise<CheckEmailResponse> {
    const response = await apiClient.get<CheckEmailResponse>("/auth/check-email", {
      params: { email }
    });
    return response.data;
  }

  /**
   * Request OTP
   */
  static async requestOTP(email: string, locale?: string): Promise<void> {
    await apiClient.post("/auth/request-otp", {
      email,
      locale
    });
  }

  /**
   * Verify OTP
   */
  static async verifyOTP(email: string, token: string): Promise<VerifyOTPResponse> {
    const response = await apiClient.post<{ success: boolean; access_token: string; refresh_token: string; user_id: string }>(
      "/auth/verify-otp",
      {
        email,
        token
      }
    );
    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      success: response.data.success,
      userId: response.data.user_id
    };
  }

  /**
   * Refresh token
   */
  static async refreshToken(refreshToken: string): Promise<VerifyOTPResponse> {
    const response = await apiClient.post<{ success: boolean; access_token: string; refresh_token: string }>("/auth/refresh", {
      refresh_token: refreshToken
    });
    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      success: response.data.success,
      userId: "" // Refresh doesn't return user_id, but interface requires it
    };
  }

  /**
   * Verify access token
   */
  static async verifyToken(accessToken: string): Promise<{ valid: boolean; userId?: string }> {
    const response = await apiClient.post<{ valid: boolean; user_id?: string }>("/auth/verify", {
      access_token: accessToken
    });
    return {
      userId: response.data.user_id,
      valid: response.data.valid
    };
  }
}
