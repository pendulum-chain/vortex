import { apiClient } from "./api-client";

export interface CheckEmailResponse {
  exists: boolean;
  action: "signin" | "signup";
}

export interface VerifyOTPResponse {
  success: boolean;
  access_token: string;
  refresh_token: string;
  user_id: string;
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
  static async requestOTP(email: string): Promise<void> {
    await apiClient.post("/auth/request-otp", {
      email
    });
  }

  /**
   * Verify OTP
   */
  static async verifyOTP(email: string, token: string): Promise<VerifyOTPResponse> {
    const response = await apiClient.post<VerifyOTPResponse>("/auth/verify-otp", {
      email,
      token
    });
    return response.data;
  }

  /**
   * Refresh token
   */
  static async refreshToken(refreshToken: string): Promise<VerifyOTPResponse> {
    const response = await apiClient.post<VerifyOTPResponse>("/auth/refresh", {
      refresh_token: refreshToken
    });
    return response.data;
  }
}
