import { AlfredPayStatus, AlfredpayCustomerType, AlfredpayKycFileType } from "@vortexfi/shared";
import { assign, fromPromise, setup } from "xstate";
import { AlfredpayService } from "../services/api/alfredpay.service";
import { AlfredpayKycContext } from "./kyc.states";

export interface MxnKycFormData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  city: string;
  state: string;
  zipCode: string;
  address: string;
  dni: string;
}

export interface MxnKycFiles {
  front: File;
  back: File;
}

const POLLING_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

export enum AlfredpayKycMachineErrorType {
  UserRejected = "USER_REJECTED",
  UnknownError = "UNKNOWN_ERROR"
}

export class AlfredpayKycMachineError extends Error {
  type: AlfredpayKycMachineErrorType;
  constructor(message: string, type: AlfredpayKycMachineErrorType) {
    super(message);
    this.type = type;
  }
}

export const alfredpayKycMachine = setup({
  actors: {
    checkStatus: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "US";

      const status = await AlfredpayService.getAlfredpayStatus(country);
      return status;
    }),

    createCustomer: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "US";
      if (input.business) {
        return AlfredpayService.createBusinessCustomer(country);
      }
      return AlfredpayService.createIndividualCustomer(country);
    }),

    getKycLink: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "US";
      if (input.business) {
        return AlfredpayService.getKybRedirectLink(country);
      }
      return AlfredpayService.getKycRedirectLink(country);
    }),
    notifyFinished: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "US";
      return AlfredpayService.notifyKycRedirectFinished(
        country,
        input.business ? AlfredpayCustomerType.BUSINESS : AlfredpayCustomerType.INDIVIDUAL
      );
    }),
    notifyOpened: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "US";
      return AlfredpayService.notifyKycRedirectOpened(
        country,
        input.business ? AlfredpayCustomerType.BUSINESS : AlfredpayCustomerType.INDIVIDUAL
      );
    }),
    pollStatus: fromPromise(async ({ input, signal }: { input: AlfredpayKycContext; signal: AbortSignal }) => {
      const country = input.country || "US";
      const startTime = Date.now();
      while (!signal.aborted) {
        if (Date.now() - startTime > POLLING_TIMEOUT_MS) {
          throw new Error("Polling timeout");
        }
        try {
          const response = await AlfredpayService.getKycStatus(
            country,
            input.business ? AlfredpayCustomerType.BUSINESS : AlfredpayCustomerType.INDIVIDUAL
          );
          if (response.status === AlfredPayStatus.Success || response.status === AlfredPayStatus.Failed) {
            return response;
          }
        } catch (e) {
          if (signal.aborted) throw e;
          // Ignore and retry
        }
        await new Promise<void>((resolve, reject) => {
          const id = setTimeout(resolve, 5000);
          signal.addEventListener("abort", () => {
            clearTimeout(id);
            reject(new Error("Aborted"));
          });
        });
      }
      throw new Error("Aborted");
    }),
    retryKyc: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "US";
      return AlfredpayService.retryKyc(
        country,
        input.business ? AlfredpayCustomerType.BUSINESS : AlfredpayCustomerType.INDIVIDUAL
      );
    }),

    sendSubmission: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "MX";
      if (!input.submissionId) throw new Error("Submission ID missing");
      return AlfredpayService.sendKycSubmission(country, input.submissionId);
    }),

    submitFiles: fromPromise(
      async ({ input }: { input: AlfredpayKycContext & { mxnFormData?: MxnKycFormData; mxnFiles?: MxnKycFiles } }) => {
        const country = input.country || "MX";
        if (!input.submissionId) throw new Error("Submission ID missing");
        if (!input.mxnFiles) throw new Error("MXN KYC files missing");
        await AlfredpayService.submitKycFile(country, input.submissionId, AlfredpayKycFileType.FRONT, input.mxnFiles.front);
        if (input.mxnFiles.back && input.mxnFormData?.documentType !== "Passport") {
          await AlfredpayService.submitKycFile(country, input.submissionId, AlfredpayKycFileType.BACK, input.mxnFiles.back);
        }
      }
    ),
    submitKycInfo: fromPromise(async ({ input }: { input: AlfredpayKycContext & { mxnFormData?: MxnKycFormData } }) => {
      const country = input.country || "MX";
      if (!input.mxnFormData) throw new Error("MXN KYC form data missing");
      return AlfredpayService.submitKycInformation(country, input.mxnFormData);
    }),

    waitForValidation: fromPromise(async ({ input, signal }: { input: AlfredpayKycContext; signal: AbortSignal }) => {
      const country = input.country || "US";
      const startTime = Date.now();
      while (!signal.aborted) {
        if (Date.now() - startTime > POLLING_TIMEOUT_MS) {
          throw new Error("Polling timeout");
        }
        try {
          const status = await AlfredpayService.getKycStatus(
            country,
            input.business ? AlfredpayCustomerType.BUSINESS : AlfredpayCustomerType.INDIVIDUAL
          );
          if (
            status.status === AlfredPayStatus.Verifying ||
            status.status === AlfredPayStatus.Success ||
            status.status === AlfredPayStatus.Failed
          ) {
            return status;
          }
        } catch (e) {
          if (signal.aborted) throw e;
          // Ignore errors during polling and keep trying
        }
        await new Promise<void>((resolve, reject) => {
          const id = setTimeout(resolve, 5000);
          signal.addEventListener("abort", () => {
            clearTimeout(id);
            reject(new Error("Aborted"));
          });
        });
      }
      throw new Error("Aborted");
    })
  },
  types: {
    context: {} as AlfredpayKycContext & { mxnFormData?: MxnKycFormData; mxnFiles?: MxnKycFiles },
    events: {} as
      | { type: "OPEN_LINK" }
      | { type: "COMPLETED_FILLING" }
      | { type: "RETRY" }
      | { type: "CONFIRM_SUCCESS" }
      | { type: "CHECK_STATUS" }
      | { type: "TOGGLE_BUSINESS" }
      | { type: "USER_ACCEPT" }
      | { type: "RETRY_PROCESS" }
      | { type: "CANCEL_PROCESS" }
      | { type: "USER_RETRY" }
      | { type: "USER_CANCEL" }
      | { type: "SUBMIT_FORM"; data: MxnKycFormData }
      | { type: "SUBMIT_FILES"; files: MxnKycFiles },
    input: {} as AlfredpayKycContext,
    output: {} as { error?: AlfredpayKycMachineError }
  }
}).createMachine({
  context: ({ input }) => ({ ...input, country: input.country || "US" }),
  id: "alfredpayKyc",
  initial: "CheckingStatus",
  output: ({ context }) => ({
    error: context.error
  }),
  states: {
    CheckingStatus: {
      invoke: {
        id: "checkStatus",
        input: ({ context }) => context,
        onDone: [
          {
            guard: ({ event }) => event.output.status === AlfredPayStatus.Success,
            target: "Done"
          },
          {
            guard: ({ event }) => event.output.status === AlfredPayStatus.Verifying,
            target: "PollingStatus"
          },
          {
            actions: assign({
              error: ({ event, context }) =>
                new AlfredpayKycMachineError(
                  `${context.business ? "KYB" : "KYC"} Failed`,
                  AlfredpayKycMachineErrorType.UnknownError
                )
            }),
            guard: ({ event }) => event.output.status === AlfredPayStatus.Failed,
            target: "FailureKyc"
          },
          {
            // MXN uses API-based form, not iFrame link
            guard: ({ context }) => context.country === "MX",
            target: "FillingKycForm"
          },
          {
            // Default state for normal flow (iFrame countries like US).
            target: "GettingKycLink"
          }
        ],
        onError: [
          {
            // MXN: no customer → skip CustomerDefinition, always individual
            guard: ({ context, event }) =>
              context.country === "MX" &&
              ((event.error as Error).message.includes("404") || (event.error as Error).message.includes("Not Found")),
            target: "CreatingCustomer"
          },
          {
            guard: ({ event }) =>
              (event.error as Error).message.includes("404") || (event.error as Error).message.includes("Not Found"),
            target: "CustomerDefinition"
          },
          {
            actions: assign({
              error: ({ event }) =>
                new AlfredpayKycMachineError((event.error as Error).message, AlfredpayKycMachineErrorType.UnknownError)
            }),
            target: "Failure"
          }
        ],
        src: "checkStatus"
      }
    },
    CreatingCustomer: {
      invoke: {
        id: "createCustomer",
        input: ({ context }) => context,
        onDone: [
          {
            guard: ({ context }) => context.country === "MX",
            target: "FillingKycForm"
          },
          {
            target: "GettingKycLink"
          }
        ],
        onError: {
          actions: assign({
            error: ({ context }) =>
              new AlfredpayKycMachineError(
                `Failed to create ${context.business ? "business " : ""}customer`,
                AlfredpayKycMachineErrorType.UnknownError
              )
          }),
          target: "Failure"
        },
        src: "createCustomer"
      }
    },
    CustomerDefinition: {
      on: {
        TOGGLE_BUSINESS: {
          actions: assign({
            business: ({ context }) => !context.business
          })
        },
        USER_ACCEPT: {
          target: "CreatingCustomer"
        }
      }
    },
    Done: {
      type: "final"
    },
    Failure: {
      on: {
        CANCEL_PROCESS: {
          target: "Done"
        },
        RETRY_PROCESS: {
          target: "CheckingStatus"
        }
      }
    },
    FailureKyc: {
      on: {
        USER_CANCEL: {
          target: "Done"
        },
        USER_RETRY: {
          target: "Retrying"
        }
      }
    },
    FillingKyc: {
      invoke: {
        id: "waitForValidation",
        input: ({ context }) => context,
        onDone: {
          target: "PollingStatus"
        },
        src: "waitForValidation"
      },
      on: {
        COMPLETED_FILLING: {
          target: "FinishingFilling"
        },
        OPEN_LINK: {
          actions: ({ context }) => {
            if (context.verificationUrl) {
              window.open(context.verificationUrl, "_blank");
            }
          }
        }
      }
    },

    FillingKycForm: {
      on: {
        SUBMIT_FORM: {
          actions: assign({ mxnFormData: ({ event }) => event.data }),
          target: "SubmittingKycInfo"
        }
      }
    },
    FinishingFilling: {
      invoke: {
        id: "notifyFinished",
        input: ({ context }) => context,
        onDone: {
          target: "PollingStatus"
        },
        onError: {
          target: "PollingStatus"
        },
        src: "notifyFinished"
      }
    },
    GettingKycLink: {
      invoke: {
        id: "getKycLink",
        input: ({ context }) => context,
        onDone: {
          actions: assign({
            submissionId: ({ event }) => event.output.submissionId,
            verificationUrl: ({ event }) => event.output.verification_url
          }),
          target: "LinkReady"
        },
        onError: {
          actions: assign({
            error: ({ context }) =>
              new AlfredpayKycMachineError(
                `Failed to get ${context.business ? "KYB" : "KYC"} link`,
                AlfredpayKycMachineErrorType.UnknownError
              )
          }),
          target: "Failure"
        },
        src: "getKycLink"
      }
    },
    LinkReady: {
      on: {
        OPEN_LINK: {
          actions: ({ context }) => {
            if (context.verificationUrl) {
              window.open(context.verificationUrl, "_blank");
            }
          },
          target: "OpeningLink"
        }
      }
    },
    OpeningLink: {
      invoke: {
        id: "notifyOpened",
        input: ({ context }) => context,
        onDone: {
          target: "FillingKyc"
        },
        onError: {
          target: "FillingKyc"
        },
        src: "notifyOpened"
      }
    },
    PollingStatus: {
      invoke: {
        id: "pollStatus",
        input: ({ context }) => context,
        onDone: [
          {
            guard: ({ event }) => event.output.status === AlfredPayStatus.Success,
            target: "VerificationDone"
          },
          {
            actions: assign({
              error: ({ event, context }) =>
                event.output.lastFailure
                  ? new AlfredpayKycMachineError(event.output.lastFailure, AlfredpayKycMachineErrorType.UnknownError)
                  : new AlfredpayKycMachineError(
                      `${context.business ? "KYB" : "KYC"} Failed`,
                      AlfredpayKycMachineErrorType.UnknownError
                    )
            }),
            guard: ({ event }) => event.output.status === AlfredPayStatus.Failed,
            target: "FailureKyc"
          }
        ],
        src: "pollStatus"
      }
    },
    Retrying: {
      invoke: {
        id: "retryKyc",
        input: ({ context }) => context,
        onDone: {
          target: "GettingKycLink"
        },
        onError: {
          actions: assign({
            error: ({ context }) =>
              new AlfredpayKycMachineError(
                `Failed to retry ${context.business ? "KYB" : "KYC"}`,
                AlfredpayKycMachineErrorType.UnknownError
              )
          }),
          target: "Failure"
        },
        src: "retryKyc"
      }
    },

    SendingSubmission: {
      invoke: {
        id: "sendSubmission",
        input: ({ context }) => context,
        onDone: {
          target: "PollingStatus"
        },
        onError: {
          actions: assign({
            error: () =>
              new AlfredpayKycMachineError("Failed to send KYC submission", AlfredpayKycMachineErrorType.UnknownError)
          }),
          target: "Failure"
        },
        src: "sendSubmission"
      }
    },

    SubmittingFiles: {
      invoke: {
        id: "submitFiles",
        input: ({ context }) => context,
        onDone: {
          target: "SendingSubmission"
        },
        onError: {
          actions: assign({
            error: () =>
              new AlfredpayKycMachineError("Failed to upload ID documents", AlfredpayKycMachineErrorType.UnknownError)
          }),
          target: "Failure"
        },
        src: "submitFiles"
      }
    },

    SubmittingKycInfo: {
      invoke: {
        id: "submitKycInfo",
        input: ({ context }) => context,
        onDone: {
          actions: assign({ submissionId: ({ event }) => (event.output as { submissionId: string }).submissionId }),
          target: "UploadingDocuments"
        },
        onError: {
          actions: assign({
            error: () =>
              new AlfredpayKycMachineError("Failed to submit KYC information", AlfredpayKycMachineErrorType.UnknownError)
          }),
          target: "Failure"
        },
        src: "submitKycInfo"
      }
    },

    UploadingDocuments: {
      on: {
        SUBMIT_FILES: {
          actions: assign({ mxnFiles: ({ event }) => event.files }),
          target: "SubmittingFiles"
        }
      }
    },
    VerificationDone: {
      on: {
        CONFIRM_SUCCESS: { target: "Done" }
      }
    }
  }
});
