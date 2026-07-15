import { apiClient } from "./api-client";

export interface VerifyOTPResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  userId: string;
}

export class AuthAPI {
  static async requestOTP(email: string): Promise<void> {
    await apiClient.post("/auth/request-otp", { email });
  }

  static async verifyOTP(email: string, token: string): Promise<VerifyOTPResponse> {
    const data = await apiClient.post<{ success: boolean; access_token: string; refresh_token: string; user_id: string }>(
      "/auth/verify-otp",
      { email, token }
    );
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      success: data.success,
      userId: data.user_id
    };
  }
}
