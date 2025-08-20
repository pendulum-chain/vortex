import { KycFailureReason } from "@packages/shared";
import { assign, setup } from "xstate";
import { KYCFormData } from "../hooks/brla/useKYCForm";
import { decideInitialStateActor } from "./actors/brla/decideInitialState.actor";
import { submitActor } from "./actors/brla/submitLevel1.actor";
import { verifyStatusActor } from "./actors/brla/verifyLevel1Status.actor";
import { BrlaKycContext } from "./kyc.states";
import { RampContext } from "./types";

export type UploadIds = {
  uploadedSelfieId: string;
  uploadedDocumentId: string;
};

export const brlaKycMachine = setup({
  actors: {
    decideInitialStateActor,
    submitActor,
    verifyStatusActor
  },
  types: {
    context: {} as BrlaKycContext,
    events: {} as
      | { type: "FORM_SUBMIT"; formData: KYCFormData }
      | { type: "DOCUMENTS_SUBMIT"; documentsId: UploadIds }
      | { type: "CLOSE_SUCCESS_MODAL" }
      | { type: "CANCEL_RETRY" }
      | { type: "RETRY" },
    input: {} as RampContext,
    output: {} as { error?: any }
  }
}).createMachine({
  context: ({ input }) => ({ ...input }) as BrlaKycContext,
  id: "brlaKyc",
  initial: "FormFilling",
  output: ({ context }) => ({
    error: context.error
  }),
  states: {
    DocumentUpload: {
      on: {
        DOCUMENTS_SUBMIT: {
          actions: assign({
            documentUploadIds: ({ event }) => event.documentsId
          })
        }
      }
    },
    Failure: {
      type: "final"
    },
    Finish: {
      type: "final"
    },
    FormFilling: {
      on: {
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
        input: ({ context }) => context,
        onDone: {
          target: "Verifying"
        },
        onError: {
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
      invoke: {
        input: ({ context }) => context,
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
