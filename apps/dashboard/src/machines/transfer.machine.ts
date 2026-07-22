import {
  type GetRampStatusResponse,
  type QuoteResponse,
  RampDirection,
  type RampProcess,
  type UnsignedTx
} from "@vortexfi/shared";
import { assign, emit, fromCallback, fromPromise, setup } from "xstate";
import type { Transaction } from "@/domain/types";
import {
  pollRampUntilTerminal,
  type RegisterTransferInput,
  registerTransfer,
  signUserTransactions,
  UserRejectedError
} from "./transfer.actors";

/** Everything the transactions table needs, captured at submit time. */
export type TransferMeta = Omit<Transaction, "id" | "createdAt" | "payinWallet" | "status"> & {
  /** Human summary for toasts/notifications, e.g. "1000.00 MXN to maria@…". */
  summary: string;
};

export interface TransferContext {
  quote: QuoteResponse | null;
  additionalData: RegisterTransferInput["additionalData"] | null;
  meta: TransferMeta | null;
  ramp: RampProcess | null;
  userTxs: UnsignedTx[];
  lastStatus: GetRampStatusResponse | null;
  errorMessage: string | null;
}

export type TransferEvent =
  | { type: "START"; quote: QuoteResponse; additionalData: RegisterTransferInput["additionalData"]; meta: TransferMeta }
  | { type: "STATUS_UPDATE"; status: GetRampStatusResponse }
  | { type: "TERMINAL"; status: GetRampStatusResponse }
  | { type: "PAYMENT_CONFIRMED" }
  | { type: "RESET" };

export type TransferEmitted =
  | { type: "TRACKING_STARTED"; ramp: RampProcess; meta: TransferMeta }
  | { type: "STATUS_CHANGED"; ramp: RampProcess; status: GetRampStatusResponse }
  | { type: "TRANSFER_FAILED"; message: string };

const initialContext: TransferContext = {
  additionalData: null,
  errorMessage: null,
  lastStatus: null,
  meta: null,
  quote: null,
  ramp: null,
  userTxs: []
};

function errorMessage(error: unknown): string {
  if (error instanceof UserRejectedError) {
    return error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong while starting the transfer.";
}

/**
 * The money-movement core ported from the widget's ramp machine
 * (RegisterRamp → UpdateRamp/sign → StartRamp → RampFollowUp), reduced to the
 * dashboard's offramp flow. Quote creation and KYC gating live outside the machine.
 */
export const transferMachine = setup({
  actors: {
    registerTransfer: fromPromise(({ input }: { input: RegisterTransferInput }) => registerTransfer(input)),
    signUserTransactions: fromPromise(({ input }: { input: { ramp: RampProcess; userTxs: UnsignedTx[] } }) =>
      signUserTransactions(input)
    ),
    startRamp: fromPromise(async ({ input }: { input: { rampId: string } }) => {
      const { RampService } = await import("@/services/api/ramp.service");
      return RampService.startRamp(input.rampId);
    }),
    trackRamp: fromCallback<TransferEvent, { rampId: string }>(({ sendBack, input }) =>
      pollRampUntilTerminal(
        input.rampId,
        status => sendBack({ status, type: "STATUS_UPDATE" }),
        status => sendBack({ status, type: "TERMINAL" })
      )
    )
  },
  guards: {
    isOnramp: ({ context }) => context.quote?.rampType === RampDirection.BUY
  },
  types: {
    context: {} as TransferContext,
    emitted: {} as TransferEmitted,
    events: {} as TransferEvent
  }
}).createMachine({
  context: initialContext,
  id: "transfer",
  initial: "Idle",
  on: {
    RESET: { actions: assign(() => initialContext), target: ".Idle" }
  },
  states: {
    AwaitingPayment: {
      on: {
        PAYMENT_CONFIRMED: { actions: assign(() => ({ errorMessage: null })), target: "Starting" }
      }
    },
    Done: {
      on: {
        RESET: { actions: assign(() => initialContext), target: "Idle" },
        START: {
          actions: assign(({ event }) => ({
            ...initialContext,
            additionalData: event.additionalData,
            meta: event.meta,
            quote: event.quote
          })),
          target: "Registering"
        }
      }
    },
    Failed: {
      on: {
        RESET: { actions: assign(() => initialContext), target: "Idle" },
        START: {
          actions: assign(({ event }) => ({
            ...initialContext,
            additionalData: event.additionalData,
            meta: event.meta,
            quote: event.quote
          })),
          target: "Registering"
        }
      }
    },
    Idle: {
      on: {
        START: {
          actions: assign(({ event }) => ({
            ...initialContext,
            additionalData: event.additionalData,
            meta: event.meta,
            quote: event.quote
          })),
          target: "Registering"
        }
      }
    },
    Registering: {
      invoke: {
        input: ({ context }) => {
          if (!context.quote || !context.additionalData) {
            throw new Error("Transfer context is incomplete");
          }
          return { additionalData: context.additionalData, quote: context.quote };
        },
        onDone: [
          {
            actions: assign(({ event }) => ({ ramp: event.output.ramp, userTxs: event.output.userTxs })),
            guard: "isOnramp",
            target: "AwaitingPayment"
          },
          {
            actions: assign(({ event }) => ({ ramp: event.output.ramp, userTxs: event.output.userTxs })),
            target: "SigningUserTxs"
          }
        ],
        onError: {
          actions: [
            assign(({ event }) => ({ errorMessage: errorMessage(event.error) })),
            emit(({ event }) => ({ message: errorMessage(event.error), type: "TRANSFER_FAILED" as const }))
          ],
          target: "Failed"
        },
        src: "registerTransfer"
      }
    },
    SigningUserTxs: {
      invoke: {
        input: ({ context }) => {
          if (!context.ramp) {
            throw new Error("Ramp is missing");
          }
          return { ramp: context.ramp, userTxs: context.userTxs };
        },
        onDone: {
          actions: assign(({ event }) => ({ ramp: event.output })),
          target: "Starting"
        },
        onError: {
          actions: [
            assign(({ event }) => ({ errorMessage: errorMessage(event.error) })),
            emit(({ event }) => ({ message: errorMessage(event.error), type: "TRANSFER_FAILED" as const }))
          ],
          target: "Failed"
        },
        src: "signUserTransactions"
      }
    },
    Starting: {
      invoke: {
        input: ({ context }) => {
          if (!context.ramp) {
            throw new Error("Ramp is missing");
          }
          return { rampId: context.ramp.id };
        },
        onDone: {
          actions: assign(({ context, event }) => ({
            ramp: {
              ...event.output,
              achPaymentData: event.output.achPaymentData ?? context.ramp?.achPaymentData,
              depositQrCode: event.output.depositQrCode ?? context.ramp?.depositQrCode,
              ibanPaymentData: event.output.ibanPaymentData ?? context.ramp?.ibanPaymentData
            }
          })),
          target: "Tracking"
        },
        // A BUY user may already have paid, so the ramp and its instructions must survive a
        // failed start: back to AwaitingPayment, where PAYMENT_CONFIRMED retries the same ramp.
        onError: [
          {
            actions: [
              assign(({ event }) => ({ errorMessage: errorMessage(event.error) })),
              emit(({ event }) => ({ message: errorMessage(event.error), type: "TRANSFER_FAILED" as const }))
            ],
            guard: "isOnramp",
            target: "AwaitingPayment"
          },
          {
            actions: [
              assign(({ event }) => ({ errorMessage: errorMessage(event.error) })),
              emit(({ event }) => ({ message: errorMessage(event.error), type: "TRANSFER_FAILED" as const }))
            ],
            target: "Failed"
          }
        ],
        src: "startRamp"
      }
    },
    Tracking: {
      entry: emit(({ context }) => {
        if (!context.ramp || !context.meta) {
          throw new Error("Tracking entered without a ramp");
        }
        return { meta: context.meta, ramp: context.ramp, type: "TRACKING_STARTED" as const };
      }),
      invoke: {
        input: ({ context }) => {
          if (!context.ramp) {
            throw new Error("Ramp is missing");
          }
          return { rampId: context.ramp.id };
        },
        src: "trackRamp"
      },
      on: {
        STATUS_UPDATE: {
          actions: [
            assign(({ event }) => ({ lastStatus: event.status })),
            emit(({ context, event }) => {
              if (!context.ramp) {
                throw new Error("Ramp is missing");
              }
              return { ramp: context.ramp, status: event.status, type: "STATUS_CHANGED" as const };
            })
          ]
        },
        TERMINAL: {
          actions: [
            assign(({ event }) => ({ lastStatus: event.status })),
            emit(({ context, event }) => {
              if (!context.ramp) {
                throw new Error("Ramp is missing");
              }
              return { ramp: context.ramp, status: event.status, type: "STATUS_CHANGED" as const };
            })
          ],
          target: "Done"
        }
      }
    }
  }
});
