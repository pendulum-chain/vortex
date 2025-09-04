import { assign, fromPromise, log, setup } from "xstate";

import { MoneriumService } from "../services/api/monerium.service";
import {
  exchangeMoneriumCode,
  handleMoneriumSiweAuth,
  initiateMoneriumAuth,
  MoneriumAuthError,
  MoneriumAuthErrorType
} from "../services/monerium/moneriumAuth";
import { MoneriumKycContext } from "./kyc.states";

export enum MoneriumKycMachineErrorType {
  UserRejected = "USER_REJECTED",
  UnknownError = "UNKNOWN_ERROR"
}

export class MoneriumKycMachineError extends Error {
  type: MoneriumKycMachineErrorType;
  constructor(message: string, type: MoneriumKycMachineErrorType) {
    super(message);
    this.type = type;
  }
}

export const moneriumKycMachine = setup({
  actors: {
    checkUserStatus: fromPromise(async ({ input }: { input: MoneriumKycContext }) => {
      if (!input.address) {
        throw new Error("Address is required");
      }
      return MoneriumService.checkUserStatus(input.address);
    }),
    exchangeMoneriumCode: fromPromise(async ({ input }: { input: MoneriumKycContext }): Promise<{ authToken: string }> => {
      if (!input.authCode) {
        throw new Error("Auth code is required");
      }
      return exchangeMoneriumCode(input.authCode, input.codeVerifier!);
    }),
    handleMoneriumSiwe: fromPromise(
      async ({ input }: { input: MoneriumKycContext }): Promise<{ authUrl: string; codeVerifier: string }> => {
        if (!input.address || !input.getMessageSignature) {
          throw new Error("Address and getMessageSignature are required");
        }
        const { authUrl, codeVerifier } = await handleMoneriumSiweAuth(input.address, input.getMessageSignature);
        return { authUrl, codeVerifier };
      }
    ),
    initiateMonerium: fromPromise(
      async ({ input }: { input: MoneriumKycContext }): Promise<{ authUrl: string; codeVerifier: string }> => {
        if (!input.address || !input.getMessageSignature) {
          throw new Error("Address and getMessageSignature are required");
        }
        const { authUrl, codeVerifier } = await initiateMoneriumAuth(input.address, input.getMessageSignature);
        return { authUrl, codeVerifier };
      }
    )
  },
  types: {
    context: {} as MoneriumKycContext,
    input: {} as MoneriumKycContext,
    output: {} as { authToken?: string; error?: MoneriumKycMachineError }
  }
}).createMachine({
  context: ({ input }) => ({ ...input }),
  id: "moneriumKyc",
  initial: "Started",
  output: ({ context }) => ({
    authToken: context.authToken,
    error: context.error
  }),
  states: {
    Done: {
      type: "final"
    },
    ExchangingCode: {
      invoke: {
        id: "exchangeMoneriumCode",
        input: ({ context }) => context,
        onDone: {
          actions: assign({
            authToken: ({ event }) => event.output.authToken
          }),
          target: "Done"
        },
        onError: {
          actions: assign({
            error: () => new MoneriumKycMachineError("Error exchanging Monerium code", MoneriumKycMachineErrorType.UnknownError)
          }),
          target: "Failure"
        },
        src: "exchangeMoneriumCode"
      }
    },
    Failure: {
      type: "final"
    },
    MoneriumRedirect: {
      invoke: {
        id: "initiateMonerium",
        input: ({ context }) => context,
        onDone: {
          actions: assign({
            authUrl: ({ event }) => event.output.authUrl,
            codeVerifier: ({ event }) => event.output.codeVerifier
          }),
          target: "Redirect"
        },
        onError: {
          actions: assign({
            error: () => new MoneriumKycMachineError("An unknown error occurred", MoneriumKycMachineErrorType.UnknownError)
          }),
          target: "Failure"
        },
        src: "initiateMonerium"
      }
    },
    MoneriumSiwe: {
      invoke: {
        id: "handleMoneriumSiwe",
        input: ({ context }) => context,
        onDone: {
          actions: assign({
            authUrl: ({ event }) => event.output.authUrl,
            codeVerifier: ({ event }) => event.output.codeVerifier
          }),
          target: "Redirect"
        },
        onError: {
          actions: assign({
            error: ({ event }) => {
              if (event.error instanceof MoneriumAuthError && event.error.type === MoneriumAuthErrorType.UserRejected) {
                return new MoneriumKycMachineError(event.error.message, MoneriumKycMachineErrorType.UserRejected);
              }
              return new MoneriumKycMachineError(
                "An unknown error occurred during Monerium SIWE",
                MoneriumKycMachineErrorType.UnknownError
              );
            }
          }),
          target: "Failure"
        },
        src: "handleMoneriumSiwe"
      }
    },
    // This state will redirect on entry and must be restored after redirect-back/refresh.
    Redirect: {
      entry: ({ context }) => {
        if (context.authUrl) {
          window.location.assign(context.authUrl);
        }
      },
      on: {
        CANCEL: {
          actions: assign({
            error: () => new MoneriumKycMachineError("Cancelled by the user", MoneriumKycMachineErrorType.UserRejected)
          }),
          target: "Failure"
        },
        CODE_RECEIVED: {
          actions: assign({ authCode: ({ event }) => event.code }),
          target: "ExchangingCode"
        },
        RETRY_REDIRECT: {
          actions: ({ context }) => {
            if (context.authUrl) {
              window.location.assign(context.authUrl);
            }
          }
        }
      }
    },
    Started: {
      invoke: {
        id: "checkUserStatus",
        input: ({ context }) => context,
        onDone: [
          {
            guard: ({ event }) => event.output.isNewUser,
            target: "MoneriumRedirect"
          },
          {
            target: "MoneriumSiwe"
          }
        ],
        onError: {
          actions: assign({
            error: () => new MoneriumKycMachineError("An unknown error occurred", MoneriumKycMachineErrorType.UnknownError)
          }),
          target: "Failure"
        },
        src: "checkUserStatus"
      }
    }
  }
});
