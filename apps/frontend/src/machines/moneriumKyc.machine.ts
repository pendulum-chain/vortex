import { AnyActorRef, assign, fromPromise, sendParent, setup } from "xstate";

import { MoneriumService } from "../services/api/monerium.service";
import {
  exchangeMoneriumCode,
  handleMoneriumSiweAuth,
  initiateMoneriumAuth,
  MoneriumAuthError,
  MoneriumAuthErrorType
} from "../services/monerium/moneriumAuth";
import { RampSigningPhase } from "../types/phases";
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
      const address = input.executionInput?.moneriumWalletAddress || input.address;
      if (!address) {
        throw new Error("Address is required");
      }
      return MoneriumService.checkUserStatus(address);
    }),
    exchangeMoneriumCode: fromPromise(async ({ input }: { input: MoneriumKycContext }): Promise<{ authToken: string }> => {
      if (!input.authCode) {
        throw new Error("Auth code is required");
      }
      return exchangeMoneriumCode(input.authCode, input.codeVerifier!);
    }),
    handleMoneriumSiwe: fromPromise(
      async ({
        input
      }: {
        input: { context: MoneriumKycContext; parent: AnyActorRef };
      }): Promise<{ authUrl: string; codeVerifier: string }> => {
        const address = input.context.executionInput?.moneriumWalletAddress || input.context.address;
        if (!address || !input.context.getMessageSignature) {
          throw new Error("Address and getMessageSignature are required");
        }
        const { authUrl, codeVerifier } = await handleMoneriumSiweAuth(
          address,
          input.context.getMessageSignature,
          input.parent
        );
        return { authUrl, codeVerifier };
      }
    ),
    initiateMonerium: fromPromise(
      async ({
        input
      }: {
        input: { context: MoneriumKycContext; parent: AnyActorRef };
      }): Promise<{ authUrl: string; codeVerifier: string }> => {
        const address = input.context.executionInput?.moneriumWalletAddress || input.context.address;
        if (!address || !input.context.getMessageSignature) {
          throw new Error("Address and getMessageSignature are required");
        }
        const { authUrl, codeVerifier } = await initiateMoneriumAuth(address, input.context.getMessageSignature, input.parent);
        return { authUrl, codeVerifier };
      }
    )
  },
  types: {
    context: {} as MoneriumKycContext,
    events: {} as
      | { type: "SIGNING_UPDATE"; phase: RampSigningPhase | undefined }
      | { type: "CANCEL" }
      | { type: "CODE_RECEIVED"; code: string }
      | { type: "RETRY_REDIRECT" },
    input: {} as MoneriumKycContext,
    output: {} as { authToken?: string; error?: MoneriumKycMachineError }
  }
}).createMachine({
  context: ({ input }) => ({ ...input }),
  id: "moneriumKyc",
  initial: "Started",
  // We relay the SIGNING_UPDATE event to the parent (ramp machine). By convention, we subscribe to the main ramp state machine for UI signing updates.
  on: {
    SIGNING_UPDATE: {
      actions: [
        sendParent(({ event }) => ({
          phase: event.phase,
          type: "SIGNING_UPDATE"
        }))
      ]
    }
  },
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
      exit: sendParent({ phase: undefined, type: "SIGNING_UPDATE" }),
      invoke: {
        id: "initiateMonerium",
        input: ({ context, self }) => ({ context, parent: self }),
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
              return new MoneriumKycMachineError("An unknown error occurred", MoneriumKycMachineErrorType.UnknownError);
            }
          }),
          target: "Failure"
        },
        src: "initiateMonerium"
      }
    },
    MoneriumSiwe: {
      exit: sendParent({ phase: undefined, type: "SIGNING_UPDATE" }),
      invoke: {
        id: "handleMoneriumSiwe",
        input: ({ context, self }) => ({ context, parent: self }),
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
