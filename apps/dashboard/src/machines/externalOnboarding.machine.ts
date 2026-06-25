import { setup } from "xstate";
import { type OnboardingContext, type OnboardingEvent, type OnboardingMachineInput, REVIEW_DELAY, VERIFY_DELAY } from "./types";

/**
 * Onboarding handed off to an external surface — an EU company Google Form or a USA
 * partner redirect. The sender leaves Vortex, returns, and confirms submission; the
 * verify → review → approved tail then mirrors provider latency.
 */
export const externalOnboardingMachine = setup({
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
  id: "externalOnboarding",
  initial: "intro",
  states: {
    approved: { entry: "setApproved", type: "final" },
    intro: { on: { SUBMIT: "verifying" } },
    review: { after: { REVIEW_DELAY: "approved" }, entry: "setInReview" },
    verifying: { after: { VERIFY_DELAY: "review" } }
  }
});
