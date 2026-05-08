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
  static async checkEmail(email: string): Promise<CheckEmailResponse> {
    return apiClient.get<CheckEmailResponse>("/auth/check-email", { params: { email } });
  }

  static async requestOTP(email: string, locale?: string): Promise<void> {
    await apiClient.post("/auth/request-otp", { email, locale });
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

  static async refreshToken(refreshToken: string): Promise<VerifyOTPResponse> {
    const data = await apiClient.post<{ success: boolean; access_token: string; refresh_token: string }>("/auth/refresh", {
      refresh_token: refreshToken
    });
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      success: data.success,
      userId: "" // Refresh doesn't return user_id, but interface requires it
    };
  }

  static async verifyToken(accessToken: string): Promise<{ valid: boolean; userId?: string }> {
    const data = await apiClient.post<{ valid: boolean; user_id?: string }>("/auth/verify", {
      access_token: accessToken
    });
    return { userId: data.user_id, valid: data.valid };
  }
}
