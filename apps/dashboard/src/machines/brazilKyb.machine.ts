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
 * Mirrors the Avenia (Brazil) KYB flow: company verification ->
 * authorized representative -> document upload -> attempt status polling.
 */
export const BRAZIL_KYB_STEPS: WizardStep[] = [
  { description: "Legal entity and CNPJ information.", id: "companyInfo", title: "Company details" },
  { description: "Person legally acting for the company.", id: "representative", title: "Authorized representative" },
  { description: "Articles of incorporation and proof of address.", id: "documents", title: "Company documents" }
];

export const brazilKybMachine = setup({
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
  id: "brazilKyb",
  initial: "companyInfo",
  states: {
    approved: { entry: "setApproved", type: "final" },
    companyInfo: { on: { NEXT: "representative" } },
    documents: { on: { BACK: "representative", SUBMIT: "verifying" } },
    representative: { on: { BACK: "companyInfo", NEXT: "documents" } },
    review: { after: { REVIEW_DELAY: "approved" }, entry: "setInReview" },
    verifying: { after: { VERIFY_DELAY: "review" } }
  }
});
