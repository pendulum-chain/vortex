import { FiatToken, QuoteResponse, RampDirection } from "@packages/shared";
import { WalletAccount } from "@talismn/connect-wallets";
import { assign, emit, fromCallback, fromPromise, setup } from "xstate";
import { ToastMessage } from "../helpers/notifications";
import { KYCFormData } from "../hooks/brla/useKYCForm";
import { QuoteService } from "../services/api";
import { RampExecutionInput, RampSigningPhase } from "../types/phases";
import { registerRampActor } from "./actors/register.actor";
import { SignRampError, SignRampErrorType, signTransactionsActor } from "./actors/sign.actor";
import { startRampActor } from "./actors/start.actor";
import { validateKycActor } from "./actors/validateKyc.actor";
import { aveniaKycMachine } from "./brlaKyc.machine";
import { kycStateNode } from "./kyc.states";
import { moneriumKycMachine } from "./moneriumKyc.machine";
import { stellarKycMachine } from "./stellarKyc.machine";
import { GetMessageSignatureCallback, RampContext, RampState } from "./types";

const QUOTE_EXPIRY_THRESHOLD_SECONDS = 120; // 2 minutes

export const SUCCESS_CALLBACK_DELAY_MS = 5000; // 5 seconds

const initialRampContext: RampContext = {
  address: undefined,
  authToken: undefined,
  callbackUrl: undefined,
  chainId: undefined,
  executionInput: undefined,
  externalSessionId: undefined,
  getMessageSignature: undefined,
  initializeFailedMessage: undefined,
  isQuoteExpired: false,
  isSep24Redo: false,
  partnerId: undefined,
  paymentData: undefined,
  quote: undefined,
  quoteId: undefined,
  quoteLocked: undefined,
  rampDirection: undefined,
  rampPaymentConfirmed: false,
  rampSigningPhase: undefined,
  rampState: undefined,
  substrateWalletAccount: undefined,
  walletLocked: undefined
};

const refetchQuote = async (
  quote: QuoteResponse,
  partnerId: string | undefined,
  sendBack: (event: RampMachineEvents) => void
) => {
  const now = Date.now();
  const expires = new Date(quote.expiresAt).getTime();
  const secondsLeft = Math.round((expires - now) / 1000);

  if (secondsLeft < QUOTE_EXPIRY_THRESHOLD_SECONDS) {
    try {
      const newQuote = await QuoteService.createQuote(
        quote.rampType,
        quote.from,
        quote.to,
        quote.inputAmount,
        quote.inputCurrency,
        quote.outputCurrency,
        partnerId
      );
      sendBack({ quote: newQuote, type: "UPDATE_QUOTE" });
    } catch (error) {
      console.error("Quote refresh failed:", error);
      sendBack({ type: "REFRESH_FAILED" });
    }
  }
};

const handleCallbackUrlRedirect = (callbackUrl: string | undefined) => {
  if (callbackUrl) {
    console.log("Redirecting to callback url...", callbackUrl);
    window.location.assign(callbackUrl);
  } else {
    // As a fallback, we just clean the URL like in urlCleaner
    console.log("No callback URL provided, cleaning URL parameters instead.");
    const cleanUrl = window.location.origin;
    window.history.replaceState({}, "", cleanUrl);
    window.location.reload();
  }
};

export type RampMachineEvents =
  | { type: "CONFIRM"; input: { executionInput: RampExecutionInput; chainId: number; rampDirection: RampDirection } }
  | { type: "onDone"; input: RampState }
  | { type: "SET_ADDRESS"; address: string | undefined }
  | { type: "SET_SUBSTRATE_WALLET_ACCOUNT"; walletAccount: WalletAccount | undefined }
  | { type: "SET_GET_MESSAGE_SIGNATURE"; getMessageSignature: GetMessageSignatureCallback | undefined }
  | { type: "SubmitLevel1"; formData: KYCFormData } // TODO: We should allow by default all child events
  | { type: "SummaryConfirm" }
  | { type: "SIGNING_UPDATE"; phase: RampSigningPhase | undefined }
  | { type: "PAYMENT_CONFIRMED" }
  | { type: "SET_RAMP_STATE"; rampState: RampState }
  | { type: "RESET_RAMP" }
  | { type: "RESET_RAMP_CALLBACK" }
  | { type: "FINISH_OFFRAMPING" }
  | { type: "SHOW_ERROR_TOAST"; message: ToastMessage }
  | { type: "PROCEED_TO_REGISTRATION" }
  | { type: "SET_QUOTE"; quoteId: string; lock: boolean }
  | { type: "UPDATE_QUOTE"; quote: QuoteResponse }
  | { type: "SET_QUOTE_PARAMS"; partnerId?: string; walletLocked?: string; callbackUrl?: string }
  | { type: "SET_EXTERNAL_ID"; externalSessionId: string | undefined }
  | { type: "INITIAL_QUOTE_FETCH_FAILED" }
  | { type: "SET_INITIALIZE_FAILED_MESSAGE"; message: string | undefined }
  | { type: "EXPIRE_QUOTE" }
  | { type: "REFRESH_FAILED" };

export const rampMachine = setup({
  actions: {
    refreshQuoteActionWithDelay: async ({ context, self }) => {
      const { quote, quoteLocked, partnerId } = context;
      if (quoteLocked || !quote) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 30000));
      await refetchQuote(quote, partnerId, event => self.send(event));
    },
    reloadKeepingParams: () => {
      window.location.reload();
    },
    resetRamp: assign(({ context }) => ({
      ...initialRampContext,
      address: context.address,
      initializeFailedMessage: context.initializeFailedMessage
    })),
    setFailedMessage: assign({
      initializeFailedMessage: () => "Ramp failed, please retry"
    }),
    showSigningRejectedErrorToast: emit({ message: ToastMessage.SIGNING_REJECTED, type: "SHOW_ERROR_TOAST" }),
    urlCleanerWithCallbackAction: ({ context }) => {
      handleCallbackUrlRedirect(context.callbackUrl);
    }
  },
  actors: {
    aveniaKyc: aveniaKycMachine,
    loadQuote: fromPromise(async ({ input }: { input: { quoteId: string } }) => {
      if (!input.quoteId) {
        throw new Error("Quote ID is required to load quote.");
      }

      const quote = await QuoteService.getQuote(input.quoteId);
      if (!quote) {
        throw new Error(`Quote with ID ${input.quoteId} not found.`);
      }
      return { isExpired: new Date(quote.expiresAt) < new Date(), quote };
    }),
    moneriumKyc: moneriumKycMachine,
    quoteRefresher: fromCallback<RampMachineEvents, { context: RampContext }>(({ sendBack, input }) => {
      const { quote, quoteLocked, partnerId } = input.context;
      // Quote will exist at this stage, but to be type safe we check again.
      if (quoteLocked || !quote) {
        return;
      }

      const doRefetch = () => refetchQuote(quote, partnerId, sendBack);

      doRefetch();
      const timer = setInterval(doRefetch, 5000);

      return () => clearInterval(timer);
    }),
    registerRamp: fromPromise(registerRampActor),
    signTransactions: fromPromise(signTransactionsActor),
    startRamp: fromPromise(startRampActor),
    stellarKyc: stellarKycMachine,
    urlCleaner: fromPromise(
      () =>
        new Promise<void>(resolve => {
          setTimeout(() => {
            console.log("Clearing URL parameters");
            const cleanUrl = window.location.origin;
            window.history.replaceState({}, "", cleanUrl);
            window.location.reload();
            resolve();
          }, 1);
        })
    ),
    validateKyc: fromPromise(validateKycActor)
  },
  types: {
    context: {} as RampContext,
    emitted: {} as { type: "SHOW_ERROR_TOAST"; message: ToastMessage },
    events: {} as RampMachineEvents
  }
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QCcCGBbADgYgMoFEAVAfVwEkB1fYgYQHkA5Q-ADUIG0AGAXUVEwD2sAJYAXYQIB2fEAA9EARgBMAdgUA6TgFZOKg3pU6VAGhABPRAEZNAnYt36zVq0BfGvWboM2PAIIAItEASvi4uFy8SCCCIuJSMvIIyu7qbgpunCVavgrlela2CEql6i6ceg7F3oZGbkEhGDgEJADiEQCyibiRQ6RkAwyRhACqCSkyGWIS0mm5ykou6krFZkp++i7ldjWKnGaFWnaVut7GCsrdIKF9EZEACmS0dMNfRj4JjJHgrIRrbKbRRKVzqcxaBTOEouQ5mao2GGvd7qMgQAA2YGwAGMpAAzYTIdDLNKrLIbUBbBzqHTeK4qLR6FpuFRuC4INwuJTqMwqfTlXnNNx6MzY3rqADSAE0aNgIFIwOphJIAG4CADWmpxypoCG1euJqHpKRp-Ah9JyiBcCl2xk5xR5Yu8Cn5LV2Kh2dnqLS0KhcKjlWHUcV6cTAAEcAK5wUSQNUarW6g1G+UxrBxpMpyBmrOW608W3pe3rR0CvQaEp6WEtTiw558zEC06NMPGXk7MynWXBN652MJ5OwVMQdOSTXm7PqHF5zAFyfTksWq3rG0KVJ2zI16F1hvNZsONvFX12f2B4POMMRkfL8eFqdpsDIZACZDqTD4q0yR-dAlzHfMJyLCBNwEMsdwrMFaWrKFGUQaVTybTkL0RK9O3MYUeRcOwVDsMwij0VEFEjTBozAKBhHfZAV1necs0NUCozjOiGJXaDYKkG0EIPSEGTkRQeS0EVTA9F03DsWSO1qHk7BFfxWy8QizlMKiaK41NGN6bBP2-X9-0A4D2Oozj6L0niFz4yQBP3KtD2Q0S8nEyS1DcIp3DkuTfUFdQ7lhcxeX0SotG03BRFQZBRCY9U50zPU2JxaLYvi3peO3fj4KcukjxQuoiM4TQjiItx0URThnH5SrhU5J5BQ8fwumfeV0ripijJ-P8ANEICqQs9ROsyrBsvLbhKwK1zciOFRStbY5KoMLxas7W5FowpozCRW4FECdqo3mTAICtMAEozBdUvlE6ztTWzSxyhy8vBFyRK2CpChlNQ7maAxQzq4iVL0NTOA03wtNeSQBAgOAZHeN7hNrABaH1OxItwRWUUGlDMRxSg8bSADFUGEfFE2QMAkYdY9YVklkIrUIVeXrALrmCwxOeaJFtLxQkacKtyeX5RE9CCrQfO0OSkUI7STUF2bEA5CT6juLxylcIpfUqPYdlhW4-TDQ6eg43piYEfF8QEAB3E7FY+xB6eUxEtFDF1VDQurdpZJsAd0bDOW0lc10gh3ayUQKikbBRzAcMw3ZUOqhRFSXVC5IiFF2lxg9o6zPxXcPjxx4UdhlbzY4DNnOxW32ngW+tymMKKYq63oi6K-ZeUKFxe7cPGzwOrQgeFYKWmUWS1A5bS7vOwvEPe2sDtMQoz3B-ZKpcAwR6CnHgsn2PIqCAIgA */
  context: initialRampContext,
  id: "ramp",
  initial: "Idle",
  on: {
    EXPIRE_QUOTE: {
      actions: assign({
        isQuoteExpired: true
      })
    },
    RESET_RAMP: {
      target: ".Resetting"
    },
    RESET_RAMP_CALLBACK: {
      actions: [{ type: "resetRamp" }, { params: { context: (self as any).context }, type: "urlCleanerWithCallbackAction" }]
    },
    SET_ADDRESS: {
      actions: assign({
        address: ({ event }) => event.address
      })
    },
    SET_EXTERNAL_ID: [
      {
        actions: [
          assign({
            externalSessionId: ({ event }) => event.externalSessionId
          })
        ],
        // Assumed to be a new session, so we reset everything and reload the page.
        // This will reload the new parameters and fetch a new quote.
        guard: ({ context, event }) =>
          event.externalSessionId !== undefined &&
          context.externalSessionId !== undefined &&
          event.externalSessionId !== context.externalSessionId,
        target: ".Idle"
      },
      {
        actions: [
          assign({
            externalSessionId: ({ event }) => event.externalSessionId
          })
        ],
        // If a sessionId is passed yet none is set in the context, we assume it's a new session and reload.
        guard: ({ context, event }) => event.externalSessionId !== undefined && context.externalSessionId === undefined,
        target: ".Idle"
      }
    ],
    SET_GET_MESSAGE_SIGNATURE: {
      actions: assign({
        getMessageSignature: ({
          event
        }: {
          event: { type: "SET_GET_MESSAGE_SIGNATURE"; getMessageSignature: GetMessageSignatureCallback | undefined };
        }) => event.getMessageSignature
      })
    },
    SET_INITIALIZE_FAILED_MESSAGE: {
      actions: assign({
        initializeFailedMessage: ({ event }) => event.message
      })
    },
    SET_SUBSTRATE_WALLET_ACCOUNT: {
      actions: assign({
        substrateWalletAccount: ({ event }) => event.walletAccount
      })
    },
    SIGNING_UPDATE: {
      actions: [assign({ rampSigningPhase: ({ event }) => event.phase })]
    }
  },
  states: {
    Failure: {
      // TODO We also need to display the "final" error message in the UI.
      entry: assign(({ context }) => ({
        ...initialRampContext,
        address: context.address
      })),
      on: {
        FINISH_OFFRAMPING: {
          target: "#ramp.Resetting"
        }
      }
    },
    Idle: {
      on: {
        INITIAL_QUOTE_FETCH_FAILED: {
          target: "InitialFetchFailed"
        },
        SET_QUOTE: {
          actions: assign({
            quoteId: ({ event }) => event.quoteId,
            quoteLocked: ({ event }) => event.lock
          }),
          target: "LoadingQuote"
        },
        SET_QUOTE_PARAMS: {
          actions: assign({
            callbackUrl: ({ event }) => event.callbackUrl,
            partnerId: ({ event }) => event.partnerId,
            walletLocked: ({ event }) => event.walletLocked
          })
        }
      }
    },
    InitialFetchFailed: {},
    KYC: kycStateNode as any,
    KycComplete: {
      invoke: {
        input: ({ context }) => ({ context }),
        src: "quoteRefresher"
      },
      on: {
        PROCEED_TO_REGISTRATION: {
          target: "RegisterRamp"
        },
        // This will trigger a quoteRefresher after some seconds
        REFRESH_FAILED: {
          actions: [{ type: "refreshQuoteActionWithDelay" }]
        },
        UPDATE_QUOTE: [
          {
            actions: assign({
              isSep24Redo: () => true,
              quote: ({ event }) => event.quote,
              quoteId: ({ event }) => event.quote.id
            }),
            guard: ({ context, event }) =>
              context.paymentData !== undefined && event.quote.outputAmount !== context.quote?.outputAmount,
            target: "QuoteReady"
          },
          {
            actions: [
              assign({
                isQuoteExpired: false,
                quote: ({ event }) => event.quote,
                quoteId: ({ event }) => event.quote.id
              })
            ],
            reenter: true,
            target: "KycComplete"
          }
        ]
      }
    },
    KycFailure: {
      always: {
        target: "Resetting"
      }
    },
    LoadingQuote: {
      invoke: {
        id: "loadQuote",
        input: ({ event }) => ({ quoteId: (event as Extract<RampMachineEvents, { type: "SET_QUOTE" }>).quoteId }),
        onDone: {
          actions: assign({
            isQuoteExpired: ({ event }) => event.output.isExpired,
            quote: ({ event }) => event.output.quote
          }),
          target: "QuoteReady"
        },
        onError: {
          actions: assign({
            isQuoteExpired: true,
            quote: undefined
          }),
          target: "Idle"
        },
        src: "loadQuote"
      }
    },
    QuoteReady: {
      on: {
        // This is the main confirm button.
        CONFIRM: {
          actions: assign({
            chainId: ({ event }) => event.input.chainId,
            executionInput: ({ event }) => event.input.executionInput,
            // Also reset any error from a previous attempt
            initializeFailedMessage: undefined,
            rampDirection: ({ event }) => event.input.rampDirection
          }),
          target: "RampRequested"
        }
      }
    },
    RampFollowUp: {
      on: {
        FINISH_OFFRAMPING: {
          target: "Resetting"
        },
        SET_RAMP_STATE: {
          actions: assign({
            rampState: ({ event }) => event.rampState
          })
        }
      }
    },
    RampRequested: {
      invoke: {
        input: ({ context }) => context,
        onDone: [
          {
            guard: ({ event }: any) => event.output.kycNeeded,
            // The guard checks validateKyc output
            // do nothing otherwise, as we wait for modal confirmation.
            target: "KYC"
          },
          {
            // If Avenia (BRL) flow and user is valid, we can simply go to the summary card.
            guard: ({ context, event }) => !event.output.kycNeeded && context.executionInput?.fiatToken === FiatToken.BRL,
            target: "RegisterRamp"
          }
        ],
        onError: "Idle",
        src: "validateKyc"
      },
      on: {
        SummaryConfirm: {
          target: "RegisterRamp"
        }
      }
    },
    RedirectCallback: {
      after: {
        5000: {
          actions: [
            { params: ({ context }: { context: RampContext }) => ({ context }), type: "urlCleanerWithCallbackAction" },
            { type: "resetRamp" }
          ],
          target: "Idle"
        }
      }
    },
    RegisterRamp: {
      invoke: {
        input: ({ context }) => context,
        onDone: {
          actions: assign({
            rampState: ({ event }) => event.output
          }),
          target: "UpdateRamp"
        },
        onError: {
          actions: [{ type: "setFailedMessage" }],
          target: "Resetting"
        },
        src: "registerRamp"
      }
    },
    Resetting: {
      entry: "resetRamp",
      invoke: {
        onDone: {
          target: "Idle"
        },
        src: "urlCleaner"
      }
    },
    StartRamp: {
      invoke: {
        input: ({ context }) => context,
        onDone: [
          {
            guard: ({ context }) => !!context.callbackUrl,
            target: "RedirectCallback"
          },
          {
            target: "RampFollowUp"
          }
        ],
        onError: {
          actions: [{ type: "setFailedMessage" }],
          target: "Resetting"
        },
        src: "startRamp"
      }
    },
    UpdateRamp: {
      invoke: {
        id: "signingActor",
        input: ({ self, context }) => ({ context, parent: self as any }),
        // If offramp, we continue to StartRamp. For onramps we wait for payment confirmation.
        onDone: [
          {
            actions: assign({
              rampState: ({ event }) => event.output as RampState
            }),
            guard: ({ context }) => context.rampDirection === RampDirection.BUY
          },
          {
            actions: assign({
              rampState: ({ event }) => event.output as RampState
            }),
            guard: ({ context }) => context.rampDirection === RampDirection.SELL,
            target: "StartRamp"
          }
        ],
        onError: [
          {
            actions: [{ type: "showSigningRejectedErrorToast" }],
            // The user rejected the signature
            guard: ({ event }) => event.error instanceof SignRampError && event.error.type === SignRampErrorType.UserRejected,
            target: "Resetting"
          },
          {
            // Handle other errors
            target: "Resetting"
          }
        ],
        src: "signTransactions"
      },
      on: {
        PAYMENT_CONFIRMED: {
          actions: assign({
            rampPaymentConfirmed: true
          }),
          target: "StartRamp"
        }
      }
    }
  }
});
