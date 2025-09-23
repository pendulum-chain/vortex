import { assign, DoneActorEvent, fromPromise, setup } from "xstate";
import { KYCFormData } from "../hooks/brla/useKYCForm";
import { BrlaService } from "../services/api";
import { KycStatus, KycSubmissionRejectedError } from "../services/signingService";
import { createSubaccountActor } from "./actors/brla/createSubaccount.actor";
import { decideInitialStateActor } from "./actors/brla/decideInitialState.actor";
import { submitActor } from "./actors/brla/submitLevel1.actor";
import { VerifyStatusActorOutput, verifyStatusActor } from "./actors/brla/verifyLevel1Status.actor";
import { AveniaKycContext } from "./kyc.states";
import { RampContext } from "./types";

export enum AveniaKycMachineErrorType {
  UserCancelled = "USER_CANCELLED",
  UnknownError = "UNKNOWN_ERROR"
}

export class AveniaKycMachineError extends Error {
  type: AveniaKycMachineErrorType;
  constructor(message: string, type: AveniaKycMachineErrorType) {
    super(message);
    this.type = type;
  }
}

export type UploadIds = {
  uploadedSelfieId: string;
  uploadedDocumentId: string;
  livenessUrl: string;
};

export const aveniaKycMachine = setup({
  actors: {
    createSubaccountActor,
    decideInitialStateActor,
    refreshLivenessUrlActor: fromPromise(
      async ({ input }: { input: { taxId?: string } }): Promise<{ livenessUrl: string; uploadedSelfieId: string }> => {
        if (!input.taxId) {
          throw new Error("taxId is required to refresh liveness URL");
        }
        const getLivenessResponse = await BrlaService.getSelfieLivenessUrl(input.taxId);
        return { livenessUrl: getLivenessResponse.livenessUrl, uploadedSelfieId: getLivenessResponse.id };
      }
    ),
    submitActor,
    verifyStatusActor
  },
  types: {
    context: {} as AveniaKycContext,
    events: {} as
      | { type: "FORM_SUBMIT"; formData: KYCFormData }
      | { type: "LIVENESS_DONE" }
      | { type: "DOCUMENTS_SUBMIT"; documentsId: UploadIds }
      | { type: "CLOSE_SUCCESS_MODAL" }
      | { type: "CANCEL_RETRY" }
      | { type: "RETRY" }
      | { type: "DOCUMENTS_BACK" }
      | { type: "LIVENESS_OPENED" }
      | { type: "REFRESH_LIVENESS_URL" }
      | { type: "CANCEL" },
    input: {} as RampContext,
    output: {} as { error?: AveniaKycMachineError }
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
          target: "LivenessCheck"
        }
      }
    },
    Failure: {
      on: {
        CANCEL_RETRY: {
          actions: assign({
            error: () => new AveniaKycMachineError("User cancelled the operation", AveniaKycMachineErrorType.UserCancelled)
          }),
          target: "Finish"
        },
        RETRY: {
          target: "FormFilling"
        }
      }
    },
    Finish: {
      type: "final"
    },
    FormFilling: {
      on: {
        CANCEL: {
          actions: assign({
            error: () => new AveniaKycMachineError("User cancelled the operation", AveniaKycMachineErrorType.UserCancelled)
          }),
          target: "Finish"
        },
        // Waits for user's submission of Level 1 KYC form.
        FORM_SUBMIT: {
          actions: assign({
            kycFormData: ({ event }) => event.formData
          }),
          target: "SubaccountSetup"
        }
      }
    },
    LivenessCheck: {
      on: {
        LIVENESS_DONE: {
          guard: ({ context }) => context.livenessCheckOpened === true,
          target: "Submit"
        },
        LIVENESS_OPENED: {
          actions: assign({
            livenessCheckOpened: () => true
          })
        },
        REFRESH_LIVENESS_URL: {
          target: "RefreshingLivenessUrl"
        }
      }
    },
    RefreshingLivenessUrl: {
      invoke: {
        input: ({ context }) => ({ taxId: context.kycFormData?.taxId }),
        onDone: {
          actions: assign({
            documentUploadIds: ({ context, event }) => {
              return {
                ...(context.documentUploadIds as UploadIds),
                livenessUrl: event.output.livenessUrl,
                uploadedSelfieId: event.output.uploadedSelfieId
              };
            }
          }),
          target: "LivenessCheck"
        },
        onError: {
          target: "LivenessCheck"
        },
        src: "refreshLivenessUrlActor"
      }
    },
    // Avenia-Migration: need to define exactly what happens UX wise. Retry? Get a new quote?.
    Rejected: {
      on: {
        CANCEL_RETRY: {
          actions: assign({
            error: () => new AveniaKycMachineError("User cancelled the operation", AveniaKycMachineErrorType.UserCancelled)
          }),
          target: "Finish"
        },
        RETRY: {
          target: "FormFilling"
        }
      }
    },
    SubaccountSetup: {
      invoke: {
        input: ({ context }: { context: AveniaKycContext }) => context,
        onDone: {
          actions: assign({
            subAccountId: ({ event }) => event.output.subAccountId
          }),
          target: "DocumentUpload"
        },
        onError: [
          {
            actions: assign({
              error: ({ event }) =>
                new AveniaKycMachineError((event.error as Error).message, AveniaKycMachineErrorType.UnknownError)
            }),
            target: "Failure"
          }
        ],
        src: "createSubaccountActor"
      }
    },
    Submit: {
      entry: assign({
        kycStatus: () => KycStatus.PENDING
      }),
      // On entry, it will send the actual KYC submission for verification. Then wait.
      invoke: {
        input: ({ context }: { context: AveniaKycContext }) => context,
        onDone: {
          target: "Verifying"
        },
        onError: [
          {
            actions: assign({
              kycStatus: () => KycStatus.REJECTED,
              rejectReason: ({ event }) => (event.error as Error).message
            }),
            guard: ({ event }) => event.error instanceof KycSubmissionRejectedError,
            target: "Rejected"
          },
          {
            actions: assign({
              error: ({ event }) =>
                new AveniaKycMachineError((event.error as Error).message, AveniaKycMachineErrorType.UnknownError)
            }),
            target: "Failure"
          }
        ],
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
        input: ({ context }: { context: AveniaKycContext }) => context,
        onDone: [
          {
            actions: assign({
              kycStatus: () => KycStatus.APPROVED
            }),
            guard: ({ event }: { event: DoneActorEvent<VerifyStatusActorOutput> }) => event.output.type === "APPROVED",
            target: "Success"
          },
          {
            actions: assign({
              kycStatus: () => KycStatus.REJECTED,
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
            error: ({ event }) =>
              new AveniaKycMachineError((event.error as Error).message, AveniaKycMachineErrorType.UnknownError)
          }),
          target: "Failure"
        },
        src: "verifyStatusActor"
      }
    }
  }
});
