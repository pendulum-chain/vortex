import { setup } from "xstate";
import {
  type OnboardingContext,
  type OnboardingEvent,
  type OnboardingMachineInput,
  REVIEW_DELAY,
  VERIFY_DELAY,
  type WizardStep
} from "./types";

/**
 * Mirrors the Mykobo (Europe) individual KYC flow: personal form keyed by
 * email -> document upload -> profile status polling. No KYB in Europe.
 */
export const EUROPE_KYC_STEPS: WizardStep[] = [
  { description: "Your name, residential address and IBAN.", id: "personalInfo", title: "Personal details" },
  { description: "Upload an ID and a recent utility bill.", id: "documents", title: "Identity & proof of address" }
];

export const europeKycMachine = setup({
  actions: {
    setApproved: ({ context }) => context.onStatusChange("approved"),
    setInReview: ({ context }) => context.onStatusChange("in_review"),
    setPending: ({ context }) => context.onStatusChange("pending")
  },
  delays: { REVIEW_DELAY, VERIFY_DELAY },
  types: {
    context: {} as OnboardingContext,
    events: {} as OnboardingEvent,
    input: {} as OnboardingMachineInput
  }
}).createMachine({
  context: ({ input }) => ({ onStatusChange: input.onStatusChange }),
  entry: "setPending",
  id: "europeKyc",
  initial: "personalInfo",
  states: {
    approved: { entry: "setApproved", type: "final" },
    documents: { on: { BACK: "personalInfo", SUBMIT: "verifying" } },
    personalInfo: { on: { NEXT: "documents" } },
    review: { after: { REVIEW_DELAY: "approved" }, entry: "setInReview" },
    verifying: { after: { VERIFY_DELAY: "review" } }
  }
});
