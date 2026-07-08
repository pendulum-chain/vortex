import { apiClient } from "./api-client";

export type OnboardingState = "approved" | "pending" | "rejected";

/** A provider/KYC account under a customer entity (GET /v1/onboarding/status). */
export interface OnboardingAccountDto {
  id: string;
  provider: string;
  country: string | null;
  rail: string | null;
  customerType: string | null;
  status: string;
  /** Normalized rollup of the provider-verbatim `status`. */
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
