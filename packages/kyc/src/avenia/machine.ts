import { assign, type DoneActorEvent, fromPromise, setup } from "xstate";
import { createSubaccountActor, createSubmitActor, createVerifyKybStatusActor, createVerifyStatusActor } from "./actors";
import type { AveniaKycDeps } from "./api";
import {
  type AveniaKybFormData,
  type AveniaKycContext,
  type AveniaKycFormData,
  AveniaKycMachineError,
  AveniaKycMachineErrorType,
  type AveniaKycOutput,
  KycStatus,
  KycSubmissionRejectedError,
  type UploadIds,
  type VerifyStatusActorOutput
} from "./types";

export function createAveniaKycMachine({ api }: AveniaKycDeps) {
  return setup({
    actors: {
      createSubaccountActor: createSubaccountActor(api),
      refreshLivenessUrlActor: fromPromise(
        async ({ input }: { input: { taxId?: string } }): Promise<{ livenessUrl: string; uploadedSelfieId: string }> => {
          if (!input.taxId) {
            throw new Error("taxId is required to refresh liveness URL");
          }
          const getLivenessResponse = await api.getSelfieLivenessUrl(input.taxId);
          return { livenessUrl: getLivenessResponse.livenessUrl, uploadedSelfieId: getLivenessResponse.id };
        }
      ),
      submitActor: createSubmitActor(api),
      verifyKybStatusActor: createVerifyKybStatusActor(api),
      verifyStatusActor: createVerifyStatusActor(api)
    },
    types: {
      context: {} as AveniaKycContext,
      events: {} as
        | { type: "FORM_SUBMIT"; formData: AveniaKycFormData | AveniaKybFormData }
        | { type: "LIVENESS_DONE" }
        | { type: "DOCUMENTS_SUBMIT"; documentsId: UploadIds }
        | { type: "CLOSE_SUCCESS_MODAL" }
        | { type: "CANCEL_RETRY" }
        | { type: "RETRY" }
        | { type: "DOCUMENTS_BACK" }
        | { type: "LIVENESS_OPENED" }
        | { type: "REFRESH_LIVENESS_URL" }
        | { type: "GO_BACK" }
        | { type: "KYB_COMPANY_DONE" }
        | { type: "KYB_REPRESENTATIVE_DONE" }
        | { type: "KYB_COMPANY_BACK" }
        | { type: "COMPANY_VERIFICATION_STARTED" }
        | { type: "REPRESENTATIVE_VERIFICATION_STARTED" },
      input: {} as AveniaKycContext,
      output: {} as AveniaKycOutput
    }
  }).createMachine({
    context: ({ input }) => ({ ...input }) as AveniaKycContext,
    id: "brlaKyc",
    initial: "FormFilling",
    output: ({ context }) => context,
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
            actions: assign({ error: () => undefined, rejectReason: () => undefined }),
            target: "FormFilling"
          }
        }
      },
      Finish: {
        type: "final"
      },
      FormFilling: {
        on: {
          FORM_SUBMIT: {
            actions: assign({
              executionInput: ({ context, event }) => {
                if (!context.executionInput) return undefined;
                return {
                  ...context.executionInput,
                  taxId: event.formData.taxId
                };
              },
              kycFormData: ({ event }) => event.formData as AveniaKycFormData,
              taxId: ({ event }) => event.formData.taxId
            }),
            target: "SubaccountSetup"
          },
          GO_BACK: {
            target: "DocumentUpload"
          }
        }
      },
      KYBFlow: {
        initial: "CompanyVerification",
        on: {
          FORM_SUBMIT: {
            actions: assign({
              executionInput: ({ context, event }) => {
                if (!context.executionInput) return undefined;
                return {
                  ...context.executionInput,
                  taxId: event.formData.taxId
                };
              },
              kycFormData: ({ event, context }) =>
                ({
                  ...context.kycFormData,
                  ...event.formData
                }) as AveniaKycFormData,
              taxId: ({ event }) => event.formData.taxId
            }),
            target: "KYBVerification"
          },
          GO_BACK: {
            target: "#brlaKyc.FormFilling"
          }
        },
        states: {
          CompanyVerification: {
            entry: assign({
              kybStep: () => "company" as const
            }),
            on: {
              COMPANY_VERIFICATION_STARTED: {
                actions: assign({
                  companyVerificationStarted: () => true
                })
              },
              KYB_COMPANY_DONE: {
                target: "RepresentativeVerification"
              }
            }
          },
          RepresentativeVerification: {
            entry: assign({
              kybStep: () => "representative" as const
            }),
            on: {
              KYB_COMPANY_BACK: {
                target: "CompanyVerification"
              },
              KYB_REPRESENTATIVE_DONE: {
                target: "StatusVerification"
              },
              REPRESENTATIVE_VERIFICATION_STARTED: {
                actions: assign({
                  representativeVerificationStarted: () => true
                })
              }
            }
          },
          StatusVerification: {
            entry: assign({
              kybStep: () => "verification" as const,
              kycStatus: () => KycStatus.PENDING
            }),
            invoke: {
              input: ({ context }: { context: AveniaKycContext }) => context,
              onDone: [
                {
                  actions: assign({ kycStatus: () => KycStatus.APPROVED }),
                  guard: ({ event }: { event: DoneActorEvent<VerifyStatusActorOutput> }) => event.output.type === "APPROVED"
                },
                {
                  actions: assign({
                    kycStatus: () => KycStatus.REJECTED,
                    rejectReason: ({ event }) => (event.output.type === "REJECTED" ? event.output.reason : undefined)
                  }),
                  guard: ({ event }: { event: DoneActorEvent<VerifyStatusActorOutput> }) => event.output.type === "REJECTED"
                }
              ],
              onError: {
                actions: assign({
                  error: ({ event }) =>
                    new AveniaKycMachineError((event.error as Error).message, AveniaKycMachineErrorType.UnknownError)
                }),
                target: "#brlaKyc.Failure"
              },
              src: "verifyKybStatusActor"
            },
            on: {
              CANCEL_RETRY: {
                actions: assign({
                  error: () =>
                    new AveniaKycMachineError("User cancelled the operation", AveniaKycMachineErrorType.UserCancelled)
                }),
                target: "#brlaKyc.Finish"
              },
              CLOSE_SUCCESS_MODAL: {
                guard: ({ context }) => context.kycStatus === KycStatus.APPROVED,
                target: "#brlaKyc.Finish"
              },
              RETRY: {
                actions: assign({ error: () => undefined, rejectReason: () => undefined }),
                target: "#brlaKyc.SubaccountSetup"
              }
            }
          }
        }
      },
      KYBVerification: {
        always: {
          target: "KYBFlow"
        },
        entry: assign({
          kycStatus: () => KycStatus.PENDING
        }),
        on: {
          GO_BACK: {
            actions: assign({
              error: () => new AveniaKycMachineError("User cancelled the operation", AveniaKycMachineErrorType.UserCancelled)
            }),
            target: "Finish"
          }
        }
      },
      LivenessCheck: {
        exit: assign({
          livenessCheckOpened: () => false
        }),
        on: {
          GO_BACK: {
            target: "DocumentUpload"
          },
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
              documentUploadIds: ({ context, event }) => ({
                ...(context.documentUploadIds as UploadIds),
                livenessUrl: event.output.livenessUrl,
                uploadedSelfieId: event.output.uploadedSelfieId
              })
            }),
            target: "LivenessCheck"
          },
          onError: {
            target: "LivenessCheck"
          },
          src: "refreshLivenessUrlActor"
        }
      },
      Rejected: {
        on: {
          CANCEL_RETRY: {
            actions: assign({
              error: () => new AveniaKycMachineError("User cancelled the operation", AveniaKycMachineErrorType.UserCancelled)
            }),
            target: "Finish"
          },
          RETRY: {
            actions: assign({ error: () => undefined, rejectReason: () => undefined }),
            target: "FormFilling"
          }
        }
      },
      SubaccountSetup: {
        invoke: {
          input: ({ context }: { context: AveniaKycContext }) => context,
          onDone: [
            {
              actions: assign({
                isCompany: ({ event }) => event.output.isCompany,
                kybAttemptId: ({ event }) => event.output.kybUrls?.attemptId,
                kybUrls: ({ event }) => {
                  if (!event.output.kybUrls) return undefined;
                  return {
                    authorizedRepresentativeUrl: event.output.kybUrls.authorizedRepresentativeUrl,
                    basicCompanyDataUrl: event.output.kybUrls.basicCompanyDataUrl
                  };
                },
                subAccountId: ({ event }) => event.output.subAccountId
              }),
              guard: ({ event }) => event.output.isCompany && !!event.output.kybUrls,
              target: "KYBFlow"
            },
            {
              actions: assign({
                isCompany: ({ event }) => event.output.isCompany,
                kycStatus: () => KycStatus.PENDING,
                subAccountId: ({ event }) => event.output.subAccountId
              }),
              guard: ({ event }) => !!event.output.maybeKycAttemptStatus,
              target: "Verifying"
            },
            {
              actions: assign({
                isCompany: ({ event }) => event.output.isCompany,
                subAccountId: ({ event }) => event.output.subAccountId
              }),
              target: "DocumentUpload"
            }
          ],
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
                rejectReason: ({ event }) => (event.output.type === "REJECTED" ? event.output.reason : undefined)
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
}

export type AveniaKycMachine = ReturnType<typeof createAveniaKycMachine>;
