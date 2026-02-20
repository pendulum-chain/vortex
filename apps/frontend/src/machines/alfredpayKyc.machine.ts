import {
  AlfredPayStatus,
  AlfredpayCreateCustomerResponse,
  AlfredpayCustomerType,
  AlfredpayGetKycRedirectLinkResponse,
  AlfredpayGetKycStatusResponse,
  AlfredpayStatusResponse
} from "@vortexfi/shared";
import { assign, fromPromise, raise, setup } from "xstate";
import { AlfredpayService } from "../services/api/alfredpay.service";
import { AlfredpayKycContext } from "./kyc.states";

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
      return AlfredpayService.createCustomer(country);
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
    pollStatus: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      console.log("Polling status for country", input.country);
      const country = input.country || "US";
      // Submission ID check removed as backend handles it

      while (true) {
        try {
          const response = await AlfredpayService.getKycStatus(
            country,
            input.business ? AlfredpayCustomerType.BUSINESS : AlfredpayCustomerType.INDIVIDUAL
          );
          if (response.status === AlfredPayStatus.Success || response.status === AlfredPayStatus.Failed) {
            return response;
          }
        } catch (e) {
          // Ignore and retry
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }),
    retryKyc: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "US";
      return AlfredpayService.retryKyc(
        country,
        input.business ? AlfredpayCustomerType.BUSINESS : AlfredpayCustomerType.INDIVIDUAL
      );
    }),
    waitForValidation: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "US";
      // Submission ID check removed as backend handles it

      while (true) {
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
          // Ignore errors during polling and keep trying
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    })
  },
  types: {
    context: {} as AlfredpayKycContext,
    events: {} as
      | { type: "OPEN_LINK" }
      | { type: "COMPLETED_FILLING" }
      | { type: "RETRY" }
      | { type: "CONFIRM_SUCCESS" }
      | { type: "CHECK_STATUS" }
      | { type: "USER_RETRY" }
      | { type: "USER_CANCEL" }
      | { type: "TOGGLE_BUSINESS" }
      | { type: "USER_ACCEPT" },
    input: {} as AlfredpayKycContext,
    output: {} as { error?: AlfredpayKycMachineError; kycResponse?: any }
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
              error: ({ event }) =>
                new AlfredpayKycMachineError("Alfredpay status failed", AlfredpayKycMachineErrorType.UnknownError)
            }),
            guard: ({ event }) => event.output.status === AlfredPayStatus.Failed,
            target: "Failure"
          },
          {
            // Default state for normal flow.
            target: "GettingKycLink"
          }
        ],
        onError: [
          {
            guard: ({ event }) =>
              (event.error as Error).message.includes("404") || (event.error as Error).message.includes("Not Found"),
            target: "CostumerDefinition"
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
    CostumerDefinition: {
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
    CreatingCustomer: {
      invoke: {
        id: "createCustomer",
        input: ({ context }) => context,
        onDone: {
          target: "GettingKycLink"
        },
        onError: {
          actions: assign({
            error: () => new AlfredpayKycMachineError("Failed to create customer", AlfredpayKycMachineErrorType.UnknownError)
          }),
          target: "Failure"
        },
        src: "createCustomer"
      }
    },
    Done: {
      type: "final"
    },
    Failure: {
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
        input: ({ context }) => context,
        onDone: {
          target: "PollingStatus"
        },
        src: "waitForValidation"
      },
      on: {
        COMPLETED_FILLING: {
          target: "FinishingFilling"
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
            error: () => new AlfredpayKycMachineError("Failed to get KYC link", AlfredpayKycMachineErrorType.UnknownError)
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
        input: ({ context }) => context,
        onDone: [
          {
            guard: ({ event }) => event.output.status === AlfredPayStatus.Success,
            target: "Done"
          },
          {
            actions: assign({
              error: ({ event }) =>
                event.output.lastFailure
                  ? new AlfredpayKycMachineError(event.output.lastFailure, AlfredpayKycMachineErrorType.UnknownError)
                  : new AlfredpayKycMachineError("KYC Failed", AlfredpayKycMachineErrorType.UnknownError)
            }),
            guard: ({ event }) => event.output.status === AlfredPayStatus.Failed,
            target: "Failure"
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
            error: () => new AlfredpayKycMachineError("Failed to retry KYC", AlfredpayKycMachineErrorType.UnknownError)
          }),
          target: "Failure"
        },
        src: "retryKyc"
      }
    }
  }
});
