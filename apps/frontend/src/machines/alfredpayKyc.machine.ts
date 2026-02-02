import {
  AlfredPayStatus,
  AlfredpayCreateCustomerResponse,
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
      return AlfredpayService.createCustomer(country, "INDIVIDUAL");
    }),
    getKycLink: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "US";
      return AlfredpayService.getKycRedirectLink(country);
    }),
    notifyFinished: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "US";
      return AlfredpayService.notifyKycRedirectFinished(country);
    }),
    notifyOpened: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "US";
      return AlfredpayService.notifyKycRedirectOpened(country);
    }),
    pollStatus: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "US";
      if (!input.submissionId) throw new Error("No submission ID");

      while (true) {
        try {
          const response = await AlfredpayService.getKycStatus(input.submissionId, country);
          if (response.status === AlfredPayStatus.Success || response.status === AlfredPayStatus.Failed) {
            return response;
          }
        } catch (e) {
          // Ignore and retry
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }),
    waitForValidation: fromPromise(async ({ input }: { input: AlfredpayKycContext }) => {
      const country = input.country || "US";
      while (true) {
        try {
          const status = await AlfredpayService.getAlfredpayStatus(country);
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
      | { type: "CHECK_STATUS" },
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
            target: "CreatingCustomer"
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
      type: "final"
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
    }
  }
});
