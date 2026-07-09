import type { OnboardingStatus } from "@/domain/types";

export interface OnboardingMachineInput {
  onStatusChange: (status: OnboardingStatus) => void;
}

export interface OnboardingContext {
  onStatusChange: (status: OnboardingStatus) => void;
}

export type OnboardingEvent = { type: "NEXT" } | { type: "BACK" } | { type: "SUBMIT" };

/** Simulated provider latency: submit -> in review -> approved. */
export const VERIFY_DELAY = 1600;
export const REVIEW_DELAY = 2800;

export interface WizardStep {
  /** Matches a machine state value. */
  id: string;
  title: string;
  description: string;
}
