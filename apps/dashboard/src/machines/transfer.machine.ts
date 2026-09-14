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
  type CheckTransferBalanceInput,
  checkTransferBalance,
  pollRampUntilTerminal,
  type RefreshTransferQuoteInput,
  type RegisterTransferInput,
  refreshTransferQuote,
  registerTransfer,
  signUserTransactions,
  type TransferQuoteRequest,
  UserRejectedError
} from "./transfer.actors";

/** Everything the transactions table needs, captured at submit time. */
export type TransferMeta = Omit<Transaction, "id" | "createdAt" | "payinWallet" | "status"> & {
  /** Effective profile that submitted the transfer. Immutable for the transfer lifetime. */
  ownerProfileId: string;
  /** Human summary for toasts/notifications, e.g. "1000.00 MXN to maria@…". */
  summary: string;
};

export interface TransferContext {
  activeOwnerProfileId: string | null;
  quote: QuoteResponse | null;
  quoteRequest: TransferQuoteRequest | null;
  additionalData: RegisterTransferInput["additionalData"] | null;
  meta: TransferMeta | null;
  ramp: RampProcess | null;
  userTxs: UnsignedTx[];
  lastStatus: GetRampStatusResponse | null;
  errorMessage: string | null;
}

export type TransferEvent =
  | {
      type: "START";
      ownerProfileId: string;
      quote: QuoteResponse;
      quoteRequest: TransferQuoteRequest;
      additionalData: RegisterTransferInput["additionalData"];
      meta: TransferMeta;
    }
  | { type: "STATUS_UPDATE"; status: GetRampStatusResponse }
  | { type: "TERMINAL"; status: GetRampStatusResponse }
  | { type: "PAYMENT_CONFIRMED"; ownerProfileId: string }
  | { type: "ACTIVATE_OWNER"; ownerProfileId: string; recovery: TransferContext | null }
  | { type: "RESET" };

export type TransferEmitted =
  | { type: "TRACKING_STARTED"; ramp: RampProcess; meta: TransferMeta }
  | { type: "STATUS_CHANGED"; ramp: RampProcess; status: GetRampStatusResponse }
  | { type: "TRANSFER_FAILED"; message: string };

const initialContext: TransferContext = {
  activeOwnerProfileId: null,
  additionalData: null,
  errorMessage: null,
  lastStatus: null,
  meta: null,
  quote: null,
  quoteRequest: null,
  ramp: null,
  userTxs: []
};

function errorMessage(error: unknown): string {
  if (error instanceof UserRejectedError) {
    return error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong while starting the transfer.";
}

function metaForQuote(meta: TransferMeta | null, quote: QuoteResponse): TransferMeta | null {
  if (!meta) {
    return null;
  }

  const destination = quote.rampType === RampDirection.BUY ? "your wallet" : meta.recipientEmail;
  return {
    ...meta,
    amountIn: quote.inputAmount,
    amountInToken: String(quote.inputCurrency),
    direction: quote.rampType,
    fiatPayoutAmount: quote.outputAmount,
    payoutCurrency: String(quote.outputCurrency),
    summary: `${quote.outputAmount} ${quote.outputCurrency} to ${destination}`
  };
}

/**
 * The money-movement core ported from the widget's ramp machine
 * (RegisterRamp → UpdateRamp/sign → StartRamp → RampFollowUp), reduced to the
 * dashboard's offramp flow. Quote creation and KYC gating live outside the machine.
 */
export const transferMachine = setup({
  actors: {
    checkTransferBalance: fromPromise(({ input }: { input: CheckTransferBalanceInput }) => checkTransferBalance(input)),
    refreshTransferQuote: fromPromise(({ input }: { input: RefreshTransferQuoteInput }) => refreshTransferQuote(input)),
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
    isOnramp: ({ context }) => context.quote?.rampType === RampDirection.BUY,
    isOwnerEvent: ({ context, event }) =>
      "ownerProfileId" in event &&
      event.ownerProfileId === context.activeOwnerProfileId &&
      (event.type !== "START" || event.meta.ownerProfileId === event.ownerProfileId) &&
      (!context.meta || context.meta.ownerProfileId === event.ownerProfileId),
    isRecoveryActivation: ({ event }) => event.type === "ACTIVATE_OWNER" && event.recovery !== null
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
    ACTIVATE_OWNER: [
      {
        actions: assign(({ event }) => ({ ...event.recovery, activeOwnerProfileId: event.ownerProfileId })),
        guard: "isRecoveryActivation",
        target: ".AwaitingPayment"
      },
      {
        actions: assign(({ event }) => ({ ...initialContext, activeOwnerProfileId: event.ownerProfileId })),
        target: ".Idle"
      }
    ],
    RESET: {
      actions: assign(({ context }) => ({ ...initialContext, activeOwnerProfileId: context.activeOwnerProfileId })),
      target: ".Idle"
    }
  },
  states: {
    AwaitingPayment: {
      on: {
        PAYMENT_CONFIRMED: {
          actions: assign(() => ({ errorMessage: null })),
          guard: "isOwnerEvent",
          target: "Starting"
        }
      }
    },
    CheckingBalance: {
      invoke: {
        input: ({ context }) => {
          if (!context.quote) {
            throw new Error("Balance check context is incomplete");
          }
          return { quote: context.quote, walletAddress: context.additionalData?.walletAddress };
        },
        onDone: { target: "Registering" },
        onError: {
          actions: [
            assign(({ event }) => ({ errorMessage: errorMessage(event.error) })),
            emit(({ event }) => ({ message: errorMessage(event.error), type: "TRANSFER_FAILED" as const }))
          ],
          target: "Failed"
        },
        src: "checkTransferBalance"
      },
      on: { ACTIVATE_OWNER: {} }
    },
    CheckingQuote: {
      invoke: {
        input: ({ context }) => {
          if (!context.quote || !context.quoteRequest) {
            throw new Error("Quote refresh context is incomplete");
          }
          return { quote: context.quote, request: context.quoteRequest };
        },
        onDone: {
          actions: assign(({ context, event }) => ({
            meta: metaForQuote(context.meta, event.output.quote),
            quote: event.output.quote
          })),
          target: "CheckingBalance"
        },
        onError: {
          actions: [
            assign(({ event }) => ({ errorMessage: errorMessage(event.error) })),
            emit(({ event }) => ({ message: errorMessage(event.error), type: "TRANSFER_FAILED" as const }))
          ],
          target: "Failed"
        },
        src: "refreshTransferQuote"
      },
      on: { ACTIVATE_OWNER: {} }
    },
    Done: {
      on: {
        START: {
          actions: assign(({ event }) => ({
            ...initialContext,
            activeOwnerProfileId: event.ownerProfileId,
            additionalData: event.additionalData,
            meta: event.meta,
            quote: event.quote,
            quoteRequest: event.quoteRequest
          })),
          guard: "isOwnerEvent",
          target: "CheckingQuote"
        }
      }
    },
    Failed: {
      on: {
        START: {
          actions: assign(({ event }) => ({
            ...initialContext,
            activeOwnerProfileId: event.ownerProfileId,
            additionalData: event.additionalData,
            meta: event.meta,
            quote: event.quote,
            quoteRequest: event.quoteRequest
          })),
          guard: "isOwnerEvent",
          target: "CheckingQuote"
        }
      }
    },
    Idle: {
      on: {
        START: {
          actions: assign(({ event }) => ({
            ...initialContext,
            activeOwnerProfileId: event.ownerProfileId,
            additionalData: event.additionalData,
            meta: event.meta,
            quote: event.quote,
            quoteRequest: event.quoteRequest
          })),
          guard: "isOwnerEvent",
          target: "CheckingQuote"
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
      },
      on: { ACTIVATE_OWNER: {} }
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
      },
      on: { ACTIVATE_OWNER: {} }
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
