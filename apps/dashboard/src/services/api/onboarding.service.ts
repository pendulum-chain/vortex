import { apiClient } from "./api-client";

export type OnboardingState = "approved" | "in_review" | "pending" | "rejected" | "started";

/** A provider/KYC account under a customer entity (GET /v1/onboarding/status). */
export interface OnboardingAccountDto {
  id: string;
  provider: string;
  country: string | null;
  companyName: string | null;
  rail: string | null;
  customerType: string | null;
  error: { code: string; message: string } | null;
  status: string;
  statusExternal: string | null;
  /** Alias retained for dashboard account-state consumers. */
  state: OnboardingState;
  kycCase: unknown | null;
}

export interface OnboardingEntityDto {
  id: string;
  status: string;
  type: string;
  accounts: OnboardingAccountDto[];
}

export interface OnboardingStatusResponse {
  entities: OnboardingEntityDto[];
}

export const OnboardingService = {
  status(): Promise<OnboardingStatusResponse> {
    return apiClient.get<OnboardingStatusResponse>("/onboarding/status");
  }
};
