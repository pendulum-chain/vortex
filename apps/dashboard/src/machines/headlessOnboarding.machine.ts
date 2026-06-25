import { assign, setup } from "xstate";
import type { OnboardingStatus } from "@/domain/types";
import { type OnboardingEvent, type OnboardingMachineInput, REVIEW_DELAY, VERIFY_DELAY } from "./types";

interface HeadlessContext {
  stepIndex: number;
  stepCount: number;
  onStatusChange: (status: OnboardingStatus) => void;
}

type HeadlessInput = OnboardingMachineInput & { stepCount: number };

/**
 * Generic headless KYC/KYB flow. The form phase is index-based so a single machine
 * drives any number of steps; the verify → review → approved tail mirrors provider latency.
 */
export const headlessOnboardingMachine = setup({
  actions: {
    next: assign({ stepIndex: ({ context }) => Math.min(context.stepIndex + 1, context.stepCount - 1) }),
    prev: assign({ stepIndex: ({ context }) => Math.max(context.stepIndex - 1, 0) }),
    setApproved: ({ context }) => context.onStatusChange("approved"),
    setInReview: ({ context }) => context.onStatusChange("in_review"),
    setPending: ({ context }) => context.onStatusChange("pending")
  },
  delays: { REVIEW_DELAY, VERIFY_DELAY },
  guards: {
    canGoBack: ({ context }) => context.stepIndex > 0,
    canGoNext: ({ context }) => context.stepIndex < context.stepCount - 1
  },
  types: {
    context: {} as HeadlessContext,
    events: {} as OnboardingEvent,
    input: {} as HeadlessInput
  }
}).createMachine({
  context: ({ input }) => ({ onStatusChange: input.onStatusChange, stepCount: input.stepCount, stepIndex: 0 }),
  entry: "setPending",
  id: "headlessOnboarding",
  initial: "form",
  states: {
    approved: { entry: "setApproved", type: "final" },
    form: {
      on: {
        BACK: { actions: "prev", guard: "canGoBack" },
        NEXT: { actions: "next", guard: "canGoNext" },
        SUBMIT: "verifying"
      }
    },
    review: { after: { REVIEW_DELAY: "approved" }, entry: "setInReview" },
    verifying: { after: { VERIFY_DELAY: "review" } }
  }
});
