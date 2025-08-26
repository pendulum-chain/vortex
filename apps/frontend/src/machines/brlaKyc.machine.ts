import { assign, DoneActorEvent, setup } from "xstate";
import { KYCFormData } from "../hooks/brla/useKYCForm";
import { KycStatus } from "../services/signingService";
import { decideInitialStateActor } from "./actors/brla/decideInitialState.actor";
import { submitActor } from "./actors/brla/submitLevel1.actor";
import { VerifyStatusActorOutput, verifyStatusActor } from "./actors/brla/verifyLevel1Status.actor";
import { AveniaKycContext } from "./kyc.states";
import { RampContext } from "./types";

export type UploadIds = {
  uploadedSelfieId: string;
  uploadedDocumentId: string;
};

export const aveniaKycMachine = setup({
  actors: {
    decideInitialStateActor,
    submitActor,
    verifyStatusActor
  },
  types: {
    context: {} as AveniaKycContext,
    events: {} as
      | { type: "FORM_SUBMIT"; formData: KYCFormData }
      | { type: "DOCUMENTS_SUBMIT"; documentsId: UploadIds }
      | { type: "CLOSE_SUCCESS_MODAL" }
      | { type: "CANCEL_RETRY" }
      | { type: "RETRY" }
      | { type: "DOCUMENTS_BACK" }
      | { type: "CANCEL" },
    input: {} as RampContext,
    output: {} as { error?: any }
  }
}).createMachine({
  context: ({ input }) => ({ ...input }) as AveniaKycContext,
  id: "brlaKyc",
  initial: "FormFilling",
  output: ({ context }) => ({
    error: context.error
  }),
  states: {
    DocumentUpload: {
      on: {
        DOCUMENTS_BACK: {
          target: "FormFilling"
        },
        DOCUMENTS_SUBMIT: {
          actions: assign({
            documentUploadIds: ({ event }) => event.documentsId
          }),
          target: "Submit"
        }
      }
    },
    Failure: {
      type: "final"
    }, // Avenia-Migration: need to define exactly what happens UX wise. Retry? Get a new quote?.
    Finish: {
      type: "final"
    },
    FormFilling: {
      on: {
        CANCEL: {
          actions: assign({
            error: ({ event }) => "User cancelled the operation"
          }),
          target: "Finish"
        },
        // Waits for user's submission of Level 1 KYC form.
        FORM_SUBMIT: {
          actions: assign({
            kycFormData: ({ event }) => event.formData
          }),
          target: "DocumentUpload"
        }
      }
    },
    Rejected: {
      on: {
        CANCEL_RETRY: {
          target: "Finish"
        },
        RETRY: {
          target: "..."
        }
      }
    },
    Submit: {
      // On entry, it will send the actual KYC submission for verification. Then wait.
      invoke: {
        input: ({ context }: { context: AveniaKycContext }) => context,
        onDone: {
          target: "Verifying"
        },
        onError: {
          // Avenia-Migration: we must parse the error message, distinguish between Avenia rejections (invalid tax id for instance) or server/network issues.
          actions: assign({
            error: ({ event }) => (event.error as Error).message
          }),
          target: "Failure"
        },
        src: "submitActor"
      }
    },
    Success: {
      on: {
        CLOSE_SUCCESS_MODAL: {
          target: "Finish"
        }
      }
    },
    Verifying: {
      entry: assign({
        kycStatus: () => KycStatus.PENDING
      }),
      invoke: {
        input: ({ context }: { context: AveniaKycContext }) => context,
        onDone: [
          {
            guard: ({ event }: { event: DoneActorEvent<VerifyStatusActorOutput> }) => event.output.type === "APPROVED",
            target: "Success"
          },
          {
            actions: assign({
              rejectReason: ({ event }) => {
                // For type safety.
                if (event.output.type === "REJECTED") {
                  return event.output.reason;
                }
              }
            }),
            guard: ({ event }: { event: DoneActorEvent<VerifyStatusActorOutput> }) => event.output.type === "REJECTED",
            target: "Rejected"
          }
        ],
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
