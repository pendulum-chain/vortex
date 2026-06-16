import {
  AlfredPayStatus,
  AlfredpayCustomerType,
  AlfredpayKybFileType,
  AlfredpayKybRelatedPersonFileType,
  AlfredpayKycFileType,
  type SubmitKybInformationRequest,
  type SubmitKybInformationResponse,
  type SubmitKycInformationRequest,
  type SubmitKycInformationResponse
} from "@vortexfi/shared";
import { assign, fromPromise, setup } from "xstate";
import { AlfredpayService } from "../services/api/alfredpay.service";
import { AlfredpayKycContext } from "./kyc.states";

/**
 * Generic Alfredpay KYC form payload (country is added by the API layer).
 * Fields are a union across MX/CO/AR; country-specific schemas pick which are required.
 */
export type AlfredpayKycFormData = Omit<SubmitKycInformationRequest, "country">;
export type KybFormData = Omit<SubmitKybInformationRequest, "country">;

export interface MxnKycFiles {
  front: File;
  back: File;
  selfie?: File;
}

export interface KybBusinessFiles {
  taxIdDocument: File;
  articlesIncorporation: File;
  proofAddress: File;
  docFront: File;
  docBack: File;
}

export interface KybPersonFiles {
  front: File;
  back: File;
}

const POLLING_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

function extractSubmissionId(payload: SubmitKybInformationResponse | SubmitKycInformationResponse): string | undefined {
  return payload.submissionId && payload.submissionId.length > 0 ? payload.submissionId : undefined;
}

/**
 * Extracts relate-person ids from Alfredpay GET …/customers/{customerId}/kyb/details.
 * Response shape: `[{ relatedPersons: [{ idRelatedPerson: "..." }] }]`.
 */
function extractKybRelatedPersonIds(payload: unknown): string[] {
  if (!Array.isArray(payload)) return [];
  const ids: string[] = [];
  for (const business of payload) {
    if (business === null || typeof business !== "object") continue;
    const relatedPersons = (business as Record<string, unknown>).relatedPersons;
    if (!Array.isArray(relatedPersons)) continue;
    for (const person of relatedPersons) {
      if (person === null || typeof person !== "object") continue;
      const id = (person as Record<string, unknown>).idRelatedPerson;
      if (typeof id === "string" && id.length > 0) ids.push(id);
    }
  }
  return ids;
}

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

      try {
        const status = await AlfredpayService.getAlfredpayStatus(country);
        return status;
      } catch (error) {
        throw error;
      }
    }),

    createCustomer: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "US";
      if (input.business) {
        return AlfredpayService.createBusinessCustomer(country);
      }
      return AlfredpayService.createIndividualCustomer(country);
    }),

    findKybCustomerAndBusiness: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "MX";
      return AlfredpayService.findKybCustomerAndBusiness(country);
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
          if (
            response.status === AlfredPayStatus.Success ||
            response.status === AlfredPayStatus.Failed ||
            response.status === AlfredPayStatus.UpdateRequired
          ) {
            return response;
          }
        } catch (e) {
          if (signal.aborted) throw e;
          // Ignore and retry
        }
        await new Promise<void>((resolve, reject) => {
          const id = setTimeout(resolve, 5000);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(id);
              reject(new Error("Aborted"));
            },
            { once: true }
          );
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

    sendKybSubmissionActor: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "MX";
      if (!input.submissionId) throw new Error("Submission ID missing");
      return AlfredpayService.sendKybSubmission(country, input.submissionId);
    }),

    sendSubmission: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "MX";
      if (!input.submissionId) throw new Error("Submission ID missing");
      return AlfredpayService.sendKycSubmission(country, input.submissionId);
    }),

    submitFiles: fromPromise(
      async ({ input }: { input: AlfredpayKycContext & { mxnFormData?: AlfredpayKycFormData; mxnFiles?: MxnKycFiles } }) => {
        const country = input.country || "MX";
        if (!input.submissionId) throw new Error("Submission ID missing");
        if (!input.mxnFiles) throw new Error("KYC files missing");
        await AlfredpayService.submitKycFile(country, input.submissionId, AlfredpayKycFileType.FRONT, input.mxnFiles.front);
        await AlfredpayService.submitKycFile(country, input.submissionId, AlfredpayKycFileType.BACK, input.mxnFiles.back);
        if (country === "AR") {
          if (!input.mxnFiles.selfie) throw new Error("Selfie file missing");
          await AlfredpayService.submitKycFile(country, input.submissionId, AlfredpayKycFileType.SELFIE, input.mxnFiles.selfie);
        }
      }
    ),

    submitKybBusinessFiles: fromPromise(
      async ({ input }: { input: AlfredpayKycContext & { kybBusinessFiles?: KybBusinessFiles } }) => {
        const country = input.country || "MX";
        if (!input.submissionId) {
          throw new Error("Submission ID missing after KYB form submit");
        }
        if (!input.kybBusinessFiles) throw new Error("KYB business files missing");
        const { submissionId, kybBusinessFiles: files } = input;
        await AlfredpayService.submitKybFile(country, submissionId, AlfredpayKybFileType.TAX_ID_DOCUMENT, files.taxIdDocument);
        await AlfredpayService.submitKybFile(
          country,
          submissionId,
          AlfredpayKybFileType.ARTICLES_INCORPORATION,
          files.articlesIncorporation
        );
        await AlfredpayService.submitKybFile(country, submissionId, AlfredpayKybFileType.PROOF_ADDRESS, files.proofAddress);
      }
    ),

    submitKybInfo: fromPromise(async ({ input }: { input: AlfredpayKycContext & { kybFormData?: KybFormData } }) => {
      const country = input.country || "MX";
      if (!input.kybFormData) throw new Error("KYB form data missing");
      return AlfredpayService.submitKybInformation(country, input.kybFormData);
    }),

    submitKybPersonFiles: fromPromise(
      async ({
        input
      }: {
        input: AlfredpayKycContext & {
          kybRelatedPersonFiles?: KybPersonFiles[];
          kybRelatedPersonIndex?: number;
          kybRelatedPersonIds?: string[];
        };
      }) => {
        const country = input.country || "MX";
        const index = input.kybRelatedPersonIndex ?? 0;
        const files = input.kybRelatedPersonFiles?.[index];
        const relatedPersonId = input.kybRelatedPersonIds?.[index];
        if (!files || !relatedPersonId) throw new Error("Missing person files or related person ID");
        await AlfredpayService.submitKybRelatedPersonFile(
          country,
          relatedPersonId,
          AlfredpayKybRelatedPersonFileType.DOC_FRONT,
          files.front
        );
        await AlfredpayService.submitKybRelatedPersonFile(
          country,
          relatedPersonId,
          AlfredpayKybRelatedPersonFileType.DOC_BACK,
          files.back
        );
      }
    ),

    submitKybRelatedPersonBundleFiles: fromPromise(
      async ({ input }: { input: AlfredpayKycContext & { kybBusinessFiles?: KybBusinessFiles } }) => {
        const country = input.country || "MX";
        const files = input.kybBusinessFiles;
        if (!files) throw new Error("KYB business files bundle missing representative ID files");
        const relatedPersonId = input.kybRelatedPersonIds?.[0];
        if (!relatedPersonId) {
          throw new Error("Related person ID missing — FindingKybCustomerAndBusiness must run before this step");
        }
        await AlfredpayService.submitKybRelatedPersonFile(
          country,
          relatedPersonId,
          AlfredpayKybRelatedPersonFileType.DOC_FRONT,
          files.docFront
        );
        await AlfredpayService.submitKybRelatedPersonFile(
          country,
          relatedPersonId,
          AlfredpayKybRelatedPersonFileType.DOC_BACK,
          files.docBack
        );
      }
    ),
    submitKycInfo: fromPromise(async ({ input }: { input: AlfredpayKycContext & { mxnFormData?: AlfredpayKycFormData } }) => {
      const country = input.country || "MX";
      if (!input.mxnFormData) throw new Error("KYC form data missing");
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
            status.status === AlfredPayStatus.Failed ||
            status.status === AlfredPayStatus.UpdateRequired
          ) {
            return status;
          }
        } catch (e) {
          if (signal.aborted) throw e;
          // Ignore errors during polling and keep trying
        }
        await new Promise<void>((resolve, reject) => {
          const id = setTimeout(resolve, 5000);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(id);
              reject(new Error("Aborted"));
            },
            { once: true }
          );
        });
      }
      throw new Error("Aborted");
    })
  },
  types: {
    context: {} as AlfredpayKycContext & {
      mxnFormData?: AlfredpayKycFormData;
      mxnFiles?: MxnKycFiles;
      kybFormData?: KybFormData;
      kybBusinessFiles?: KybBusinessFiles;
      kybRelatedPersonFiles?: KybPersonFiles[];
      kybRelatedPersonIndex?: number;
      kybRelatedPersonIds?: string[];
    },
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
      | { type: "GO_BACK" }
      | { type: "SUBMIT_FORM"; data: AlfredpayKycFormData }
      | { type: "SUBMIT_FILES"; files: MxnKycFiles }
      | { type: "SUBMIT_KYB_FORM"; data: KybFormData }
      | { type: "SUBMIT_KYB_BUSINESS_FILES"; files: KybBusinessFiles }
      | { type: "SUBMIT_KYB_PERSON_FILES"; files: KybPersonFiles },
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
            guard: ({ event }) =>
              event.output.status === AlfredPayStatus.Failed || event.output.status === AlfredPayStatus.UpdateRequired,
            target: "FailureKyc"
          },
          {
            // Business (KYB deep link) on API-based countries → company KYB form, not the individual KYC form.
            guard: ({ context }) => (context.country === "MX" || context.country === "CO") && !!context.business,
            target: "FillingKybForm"
          },
          {
            // MXN, CO, and AR use API-based form, not iFrame link
            guard: ({ context }) => context.country === "MX" || context.country === "CO" || context.country === "AR",
            target: "FillingKycForm"
          },
          {
            // Default state for normal flow (iFrame countries like US).
            target: "GettingKycLink"
          }
        ],
        onError: [
          {
            // No customer found → show CustomerDefinition for all countries (individual or business choice)
            guard: ({ event }) => {
              const error = event.error as any;
              const message = (error?.message || error?.toString() || "").toLowerCase();
              return error?.status === 404 || message.includes("404") || message.includes("not found");
            },
            target: "CustomerDefinition"
          },
          {
            actions: assign({
              error: ({ event }) => {
                return new AlfredpayKycMachineError(
                  (event.error as Error)?.message || "Unknown error",
                  AlfredpayKycMachineErrorType.UnknownError
                );
              }
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
            guard: ({ context }) =>
              (context.country === "MX" || context.country === "CO" || context.country === "AR") && !!context.business,
            target: "FillingKybForm"
          },
          {
            guard: ({ context }) => context.country === "MX" || context.country === "CO" || context.country === "AR",
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

    FillingKybForm: {
      on: {
        SUBMIT_KYB_FORM: {
          actions: assign({ kybFormData: ({ event }) => event.data }),
          target: "SubmittingKybInfo"
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
        SUBMIT_FORM: [
          {
            actions: assign({ mxnFormData: ({ event }) => event.data }),
            // submissionId exists → user returned from doc upload, skip re-submission
            guard: ({ context }) => !!context.submissionId,
            target: "UploadingDocuments"
          },
          {
            actions: assign({ mxnFormData: ({ event }) => event.data }),
            target: "SubmittingKycInfo"
          }
        ]
      }
    },

    FindingKybCustomerAndBusiness: {
      invoke: {
        id: "findKybCustomerAndBusiness",
        input: ({ context }) => context,
        onDone: [
          {
            actions: assign({
              error: () =>
                new AlfredpayKycMachineError(
                  "Alfredpay GET …/customers/{customerId}/kyb/details did not return relatedPersons[].idRelatedPerson.",
                  AlfredpayKycMachineErrorType.UnknownError
                )
            }),
            guard: ({ event }) => extractKybRelatedPersonIds(event.output).length === 0,
            target: "Failure"
          },
          {
            actions: assign({
              kybRelatedPersonIds: ({ event }) => extractKybRelatedPersonIds(event.output)
            }),
            target: "SubmittingKybRelatedPersonBundle"
          }
        ],
        onError: {
          actions: assign({
            error: () =>
              new AlfredpayKycMachineError(
                "Failed to fetch related person ids from Alfredpay",
                AlfredpayKycMachineErrorType.UnknownError
              )
          }),
          target: "Failure"
        },
        src: "findKybCustomerAndBusiness"
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
            guard: ({ event }) =>
              event.output.status === AlfredPayStatus.Failed || event.output.status === AlfredPayStatus.UpdateRequired,
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
        onDone: [
          {
            guard: ({ context }) =>
              (context.country === "MX" || context.country === "CO" || context.country === "AR") && !!context.business,
            target: "FillingKybForm"
          },
          {
            guard: ({ context }) => context.country === "MX" || context.country === "CO" || context.country === "AR",
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
                `Failed to retry ${context.business ? "KYB" : "KYC"}`,
                AlfredpayKycMachineErrorType.UnknownError
              )
          }),
          target: "Failure"
        },
        src: "retryKyc"
      }
    },

    SendingKybSubmission: {
      invoke: {
        id: "sendKybSubmissionActor",
        input: ({ context }) => context,
        onDone: { target: "PollingStatus" },
        onError: {
          actions: assign({
            error: () =>
              new AlfredpayKycMachineError("Failed to send KYB submission", AlfredpayKycMachineErrorType.UnknownError)
          }),
          target: "Failure"
        },
        src: "sendKybSubmissionActor"
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
            error: ({ event }) => {
              const err = event.error;
              const msg = err instanceof Error ? err.message : "";
              return msg
                ? new AlfredpayKycMachineError(msg, AlfredpayKycMachineErrorType.UnknownError)
                : new AlfredpayKycMachineError("Failed to upload ID documents", AlfredpayKycMachineErrorType.UnknownError);
            }
          }),
          target: "UploadingDocuments"
        },
        src: "submitFiles"
      }
    },

    SubmittingKybBusinessFiles: {
      invoke: {
        id: "submitKybBusinessFiles",
        input: ({ context }) => context,
        onDone: {
          target: "FindingKybCustomerAndBusiness"
        },
        onError: {
          actions: assign({
            error: ({ event }) => {
              const err = event.error;
              const msg = err instanceof Error ? err.message : "";
              return msg
                ? new AlfredpayKycMachineError(msg, AlfredpayKycMachineErrorType.UnknownError)
                : new AlfredpayKycMachineError(
                    "Failed to upload KYB business documents",
                    AlfredpayKycMachineErrorType.UnknownError
                  );
            }
          }),
          target: "Failure"
        },
        src: "submitKybBusinessFiles"
      }
    },

    SubmittingKybInfo: {
      invoke: {
        id: "submitKybInfo",
        input: ({ context }) => context,
        onDone: [
          {
            actions: assign({
              error: () =>
                new AlfredpayKycMachineError(
                  "KYB information was submitted but Alfredpay did not return a submission ID",
                  AlfredpayKycMachineErrorType.UnknownError
                )
            }),
            guard: ({ event }) => !extractSubmissionId(event.output),
            target: "Failure"
          },
          {
            actions: assign({
              submissionId: ({ event }) => extractSubmissionId(event.output)
            }),
            target: "UploadingKybBusinessDocs"
          }
        ],
        onError: {
          actions: assign({
            error: () =>
              new AlfredpayKycMachineError("Failed to submit KYB information", AlfredpayKycMachineErrorType.UnknownError)
          }),
          target: "Failure"
        },
        src: "submitKybInfo"
      }
    },

    SubmittingKybPersonFiles: {
      invoke: {
        id: "submitKybPersonFiles",
        input: ({ context }) => context,
        onDone: [
          {
            actions: assign({ kybRelatedPersonIndex: ({ context }) => (context.kybRelatedPersonIndex ?? 0) + 1 }),
            guard: ({ context }) => {
              const total = context.kybRelatedPersonIds?.length ?? 0;
              return (context.kybRelatedPersonIndex ?? 0) + 1 < total;
            },
            target: "UploadingKybPersonDocs"
          },
          { target: "SendingKybSubmission" }
        ],
        onError: {
          actions: assign({
            error: () =>
              new AlfredpayKycMachineError(
                "Failed to upload representative documents",
                AlfredpayKycMachineErrorType.UnknownError
              )
          }),
          target: "Failure"
        },
        src: "submitKybPersonFiles"
      }
    },

    SubmittingKybRelatedPersonBundle: {
      invoke: {
        id: "submitKybRelatedPersonBundleFiles",
        input: ({ context }) => context,
        onDone: {
          target: "SendingKybSubmission"
        },
        onError: {
          actions: assign({
            error: ({ event }) => {
              const err = event.error;
              const msg = err instanceof Error ? err.message : "";
              return msg
                ? new AlfredpayKycMachineError(msg, AlfredpayKycMachineErrorType.UnknownError)
                : new AlfredpayKycMachineError(
                    "Failed to submit KYB relate-person documents (POST submitKybRelatedPersonFile)",
                    AlfredpayKycMachineErrorType.UnknownError
                  );
            }
          }),
          target: "Failure"
        },
        src: "submitKybRelatedPersonBundleFiles"
      }
    },

    SubmittingKycInfo: {
      invoke: {
        id: "submitKycInfo",
        input: ({ context }) => context,
        onDone: {
          actions: assign({
            submissionId: ({ event }) => extractSubmissionId(event.output)
          }),
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
        GO_BACK: { target: "FillingKycForm" },
        SUBMIT_FILES: {
          actions: assign({ mxnFiles: ({ event }) => event.files }),
          target: "SubmittingFiles"
        }
      }
    },

    UploadingKybBusinessDocs: {
      on: {
        GO_BACK: { target: "FillingKybForm" },
        SUBMIT_KYB_BUSINESS_FILES: {
          actions: assign({ kybBusinessFiles: ({ event }) => event.files }),
          target: "SubmittingKybBusinessFiles"
        }
      }
    },

    UploadingKybPersonDocs: {
      on: {
        GO_BACK: { target: "UploadingKybBusinessDocs" },
        SUBMIT_KYB_PERSON_FILES: {
          actions: assign({
            kybRelatedPersonFiles: ({ context, event }) => {
              const existing = context.kybRelatedPersonFiles ?? [];
              const index = context.kybRelatedPersonIndex ?? 0;
              const updated = [...existing];
              updated[index] = event.files;
              return updated;
            }
          }),
          target: "SubmittingKybPersonFiles"
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
