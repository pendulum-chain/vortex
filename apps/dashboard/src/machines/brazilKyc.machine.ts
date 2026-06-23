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
 * Mirrors the Avenia (Brazil) individual KYC flow: personal form ->
 * document upload -> liveness check -> attempt status polling.
 */
export const BRAZIL_KYC_STEPS: WizardStep[] = [
  { description: "Your name, CPF and date of birth.", id: "personalInfo", title: "Personal details" },
  { description: "Upload both sides of your ID or CNH.", id: "documents", title: "Identity document" },
  { description: "Confirm it's really you with a quick selfie.", id: "liveness", title: "Liveness check" }
];

export const brazilKycMachine = setup({
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
  id: "brazilKyc",
  initial: "personalInfo",
  states: {
    approved: { entry: "setApproved", type: "final" },
    documents: { on: { BACK: "personalInfo", NEXT: "liveness" } },
    liveness: { on: { BACK: "documents", SUBMIT: "verifying" } },
    personalInfo: { on: { NEXT: "documents" } },
    review: { after: { REVIEW_DELAY: "approved" }, entry: "setInReview" },
    verifying: { after: { VERIFY_DELAY: "review" } }
  }
});
