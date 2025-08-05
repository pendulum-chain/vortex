import { KycFailureReason } from "@packages/shared";
import { assign, setup } from "xstate";
import { KYCFormData } from "../hooks/brla/useKYCForm";
import { decideInitialStateActor } from "./actors/brla/decideInitialState.actor";
import { submitLevel1Actor } from "./actors/brla/submitLevel1.actor";
import { verifyStatusActor } from "./actors/brla/verifyLevel1Status.actor";
import { RampContext } from "./types";

export interface BRLAKycContext extends RampContext {
  kycFormData?: KYCFormData;
  taxId: string;
  error?: string;
  failureReason?: KycFailureReason;
}

export const brlaKycMachine = setup({
  actors: {
    decideInitialStateActor,
    submitLevel1Actor,
    verifyStatusActor
  },
  types: {
    context: {} as BRLAKycContext,
    events: {} as
      | { type: "SubmitLevel1"; formData: KYCFormData }
      | { type: "SubmitLevel2"; formData: KYCFormData }
      | { type: "CloseSuccessModal" },
    input: {} as { taxId: string },
    output: {} as BRLAKycContext
  }
}).createMachine({
  context: ({ input }) =>
    ({
      error: undefined,
      failureReason: undefined,
      kycFormData: undefined,
      taxId: input.taxId
    }) as BRLAKycContext,
  id: "brlaKyc",
  initial: "Started",
  output: ({ context }) => context,
  states: {
    Failure: {},
    Finish: {
      type: "final"
    },
    Level1: {
      on: {
        // Waits for user's submission of Level 1 KYC form.
        SubmitLevel1: {
          actions: assign({
            kycFormData: ({ event }) => event.formData
          }),
          invoke: {
            input: ({
              context,
              event
            }: {
              context: BRLAKycContext;
              event: { type: "SubmitLevel1"; formData: KYCFormData };
            }) => ({
              formData: event.formData,
              taxId: context.taxId
            }),
            onDone: {
              target: "VerifyingLevel1"
            },
            onError: {
              actions: assign({
                error: ({ event }) => (event.error as Error).message
              }),
              target: "Failure"
            },
            src: "submitLevel1Actor"
          },
          target: "VerifyingLevel1"
        }
      }
    },
    Level2: {
      on: {
        SubmitLevel2: {
          target: "VerifyingLevel2"
          // actions: assign({ kycFormData: ({ event }) => event.formData })
        }
      }
    },
    RejectedLevel1: {},
    RejectedLevel2: {},
    Started: {
      invoke: {
        onDone: [
          {
            guard: ({ event }) => event.output === "Level1",
            target: "Level1"
          },
          {
            guard: ({ event }) => event.output === "Level2",
            target: "Level2"
          }
        ],
        onError: {
          actions: assign({
            error: ({ event }) => (event.error as Error).message
          }),
          target: "Failure"
        },
        src: "decideInitialStateActor"
      }
    },
    Success: {
      on: {
        CloseSuccessModal: {
          target: "Finish"
        }
      }
    },
    VerifyingLevel1: {
      invoke: {
        input: ({ context }) => ({ taxId: context.taxId }),
        onDone: {
          target: "Success"
        },
        onError: {
          actions: assign({
            error: ({ event }) => (event.error as Error).message
          }),
          target: "Failure"
        },
        src: "verifyStatusActor"
      }
    },
    VerifyingLevel2: {
      invoke: {
        input: ({ context }) => ({ taxId: context.taxId }),
        onDone: {
          target: "Success"
        },
        onError: {
          actions: assign({
            error: ({ event }) => (event.error as Error).message
          }),
          target: "Failure"
        },
        src: "verifyStatusActor"
      }
    }
  }
});
