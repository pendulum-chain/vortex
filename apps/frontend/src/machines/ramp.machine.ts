import { FiatToken, RampDirection } from "@vortexfi/shared";
import { assign, emit, fromCallback, fromPromise, setup } from "xstate";
import { ToastMessage } from "../helpers/notifications";
import { AuthService } from "../services/auth";
import { checkEmailActor, requestOTPActor, verifyOTPActor } from "./actors/auth.actor";
import { registerRampActor } from "./actors/register.actor";
import { SignRampError, SignRampErrorType, signTransactionsActor } from "./actors/sign.actor";
import { startRampActor } from "./actors/start.actor";
import { validateKycActor } from "./actors/validateKyc.actor";
import { alfredpayKycMachine } from "./alfredpayKyc.machine";
import { aveniaKycMachine } from "./brlaKyc.machine";
import { kycStateNode } from "./kyc.states";
import { mykoboKycMachine } from "./mykoboKyc.machine";
import {
  checkAndRefreshTokenActor,
  cleanUrlActor,
  createQuoteRefresher,
  loadQuoteActor,
  redirectToCallbackOrCleanUrl,
  refreshQuoteIfNeeded
} from "./ramp.actors";
import { createResetRampContext, initialRampContext } from "./ramp.context";
import { RampContext, RampMachineActor, RampMachineEvents, RampState } from "./types";

export const SUCCESS_CALLBACK_DELAY_MS = 5000; // 5 seconds
const QUOTE_REFRESH_RETRY_DELAY_MS = 30000;

function getActorErrorMessage(event: unknown): string {
  if (typeof event !== "object" || event === null || !("error" in event)) {
    return "An unexpected error occurred.";
  }

  const { error } = event as { error?: unknown };
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error as { message?: unknown };
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return "An unexpected error occurred.";
}

export const rampMachine = setup({
  actions: {
    refreshQuoteActionWithDelay: async ({ context, self }) => {
      const { quote, quoteLocked, apiKey, partnerId } = context;
      if (quoteLocked || !quote) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, QUOTE_REFRESH_RETRY_DELAY_MS));
      await refreshQuoteIfNeeded(quote, apiKey, partnerId, event => self.send(event));
    },

    resetRamp: assign(({ context }) => createResetRampContext(context)),
    setErrorMessage: assign({
      errorMessage: ({ event }: { event: unknown }) => getActorErrorMessage(event)
    }),
    showSigningRejectedErrorToast: emit({ message: ToastMessage.SIGNING_REJECTED, type: "SHOW_ERROR_TOAST" }),
    urlCleanerWithCallbackAction: ({ context }) => {
      redirectToCallbackOrCleanUrl(context.callbackUrl);
    }
  },
  actors: {
    alfredpayKyc: alfredpayKycMachine,
    aveniaKyc: aveniaKycMachine,
    checkAndRefreshToken: fromPromise(checkAndRefreshTokenActor),
    checkEmail: fromPromise(checkEmailActor),
    loadQuote: fromPromise(loadQuoteActor),
    mykoboKyc: mykoboKycMachine,
    quoteRefresher: fromCallback<RampMachineEvents, { context: RampContext }>(({ sendBack, input }) => {
      return createQuoteRefresher(input.context, sendBack);
    }),
    registerRamp: fromPromise(registerRampActor),
    requestOTP: fromPromise(requestOTPActor),
    signTransactions: fromPromise(signTransactionsActor),
    startRamp: fromPromise(startRampActor),
    urlCleaner: fromPromise(cleanUrlActor),
    validateKyc: fromPromise(validateKycActor),
    verifyOTP: fromPromise(verifyOTPActor)
  },
  types: {
    context: {} as RampContext,
    emitted: {} as { type: "SHOW_ERROR_TOAST"; message: ToastMessage },
    events: {} as RampMachineEvents
  }
}).createMachine({
  context: initialRampContext,
  id: "ramp",
  initial: "Idle",
  on: {
    AUTH_SUCCESS: {
      actions: assign({
        isAuthenticated: true,
        userEmail: ({ event }) => event.tokens.userEmail,
        userId: ({ event }) => event.tokens.userId
      })
    },
    EXPIRE_QUOTE: {
      actions: assign({
        isQuoteExpired: true
      })
    },
    LOGOUT: {
      actions: assign({
        isAuthenticated: false,
        userEmail: undefined,
        userId: undefined
      }),
      target: "#ramp.EnterEmail"
    },
    RESET_RAMP: {
      target: ".Resetting"
    },
    RESET_RAMP_CALLBACK: {
      actions: [{ type: "resetRamp" }, { type: "urlCleanerWithCallbackAction" }]
    },
    SET_ADDRESS: {
      actions: assign({
        connectedWalletAddress: ({ event }) => event.address
      })
    },
    SET_EXTERNAL_ID: {
      // New sessionId (different from the one in context, or none was set): hard-reload so the new params drive a fresh quote.
      // The reload wipes XState state entirely, so an assign/target here would never execute.
      actions: [() => window.location.reload()],
      guard: ({ context, event }) =>
        event.externalSessionId !== undefined && event.externalSessionId !== context.externalSessionId
    },
    SET_GET_MESSAGE_SIGNATURE: {
      actions: assign({
        getMessageSignature: ({ event }: { event: Extract<RampMachineEvents, { type: "SET_GET_MESSAGE_SIGNATURE" }> }) =>
          event.getMessageSignature
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
      actions: [
        assign({
          rampSigningPhase: ({ event }) => event.phase,
          rampSigningPhaseCurrent: ({ context, event }) =>
            event.current !== undefined ? event.current : context.rampSigningPhaseCurrent,
          rampSigningPhaseMax: ({ context, event }) => (event.max !== undefined ? event.max : context.rampSigningPhaseMax)
        })
      ]
    }
  },
  states: {
    CheckAuth: {
      invoke: {
        onDone: [
          {
            actions: [
              assign({
                isAuthenticated: true,
                userEmail: ({ event }) => event.output.tokens?.userEmail,
                userId: ({ event }) => event.output.tokens?.userId
              })
            ],
            guard: ({ event, context }) => event.output.success === true && context.postAuthTarget === "RegisterRamp",
            target: "RegisterRamp"
          },
          {
            actions: [
              assign({
                isAuthenticated: true,
                userEmail: ({ event }) => event.output.tokens?.userEmail,
                userId: ({ event }) => event.output.tokens?.userId
              })
            ],
            guard: ({ event, context }) => event.output.success === true && context.postAuthTarget === "QuoteReady",
            target: "QuoteReady"
          },
          {
            actions: [
              assign({
                isAuthenticated: false,
                userEmail: undefined,
                userId: undefined
              })
            ],
            target: "EnterEmail"
          }
        ],
        onError: {
          // On error, treat as not authenticated
          actions: [
            assign({
              isAuthenticated: false
            })
          ],
          target: "EnterEmail"
        },
        src: "checkAndRefreshToken"
      },
      on: {
        GO_BACK: [
          {
            actions: assign({
              errorMessage: undefined
            }),
            guard: ({ context }) => context.postAuthTarget === "RegisterRamp",
            target: "KycComplete"
          },
          {
            actions: assign({
              enteredViaForm: undefined,
              errorMessage: undefined,
              postAuthTarget: undefined,
              quote: undefined,
              quoteId: undefined
            }),
            target: "Idle"
          }
        ]
      }
    },
    CheckingEmail: {
      invoke: {
        input: ({ context }) => ({ context }),
        onDone: {
          target: "RequestingOTP"
        },
        onError: {
          actions: assign({
            errorMessage: "Failed to check email. Please try again."
          }),
          target: "EnterEmail"
        },
        src: "checkEmail"
      },
      on: {
        GO_BACK: [
          {
            actions: assign({
              errorMessage: undefined
            }),
            guard: ({ context }) => context.postAuthTarget === "RegisterRamp",
            target: "KycComplete"
          },
          {
            actions: assign({
              enteredViaForm: undefined,
              errorMessage: undefined,
              postAuthTarget: undefined,
              quote: undefined,
              quoteId: undefined
            }),
            target: "Idle"
          }
        ]
      }
    },
    EnterEmail: {
      on: {
        ENTER_EMAIL: {
          actions: assign({
            userEmail: ({ event }) => event.email
          }),
          target: "CheckingEmail"
        },
        GO_BACK: [
          {
            actions: assign({
              errorMessage: undefined
            }),
            guard: ({ context }) => context.postAuthTarget === "RegisterRamp",
            target: "KycComplete"
          },
          {
            actions: assign({
              enteredViaForm: undefined,
              errorMessage: undefined,
              postAuthTarget: undefined,
              quote: undefined,
              quoteId: undefined
            }),
            target: "Idle"
          }
        ],
        SET_QUOTE: {
          actions: assign({
            quoteId: ({ event }) => event.quoteId,
            quoteLocked: ({ event }) => event.lock
          })
        },
        SET_QUOTE_PARAMS: {
          actions: assign({
            apiKey: ({ event }) => event.apiKey,
            callbackUrl: ({ event }) => event.callbackUrl,
            partnerId: ({ event }) => event.partnerId,
            walletLocked: ({ event }) => event.walletLocked
          })
        }
      }
    },
    EnterOTP: {
      on: {
        CHANGE_EMAIL: {
          actions: assign({
            errorMessage: undefined,
            userEmail: undefined
          }),
          target: "EnterEmail"
        },
        ENTER_EMAIL: {
          actions: assign({
            errorMessage: undefined,
            userEmail: ({ event }) => event.email
          }),
          target: "CheckingEmail"
        },
        GO_BACK: [
          {
            actions: assign({
              errorMessage: undefined
            }),
            target: "EnterEmail"
          }
        ],
        VERIFY_OTP: {
          actions: assign({ errorMessage: undefined }),
          target: "VerifyingOTP"
        }
      }
    },
    Error: {
      entry: assign(({ context }) => ({
        ...context,
        rampSigningPhase: undefined,
        rampSigningPhaseCurrent: undefined,
        rampSigningPhaseMax: undefined
      })),
      on: {
        RESET_RAMP: {
          target: "Resetting"
        }
      }
    },
    Failure: {
      // TODO We also need to display the "final" error message in the UI.
      entry: assign(({ context }) => ({
        ...initialRampContext,
        connectedWalletAddress: context.connectedWalletAddress
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
            enteredViaForm: ({ event }) => event.enteredViaForm,
            quoteId: ({ event }) => event.quoteId,
            quoteLocked: ({ event }) => event.lock
          }),
          target: "LoadingQuote"
        },
        SET_QUOTE_PARAMS: {
          actions: assign({
            apiKey: ({ event }) => event.apiKey,
            callbackUrl: ({ event }) => event.callbackUrl,
            partnerId: ({ event }) => event.partnerId,
            walletLocked: ({ event }) => event.walletLocked
          })
        }
      }
    },
    InitialFetchFailed: {},
    // biome-ignore lint/suspicious/noExplicitAny: child KYC state node is shared across machines and XState cannot infer its event union here.
    KYC: kycStateNode as any,
    KycComplete: {
      invoke: {
        input: ({ context }) => ({ context }),
        src: "quoteRefresher"
      },
      on: {
        GO_BACK: {
          target: "QuoteReady"
        },
        PROCEED_TO_REGISTRATION: [
          {
            actions: assign({
              executionInput: ({ context, event }) =>
                context.executionInput
                  ? { ...context.executionInput, selectedFiatAccountId: event.selectedFiatAccountId }
                  : context.executionInput,
              postAuthTarget: () => "RegisterRamp"
            }),
            guard: ({ context }) => !context.isAuthenticated,
            target: "CheckAuth"
          },
          {
            actions: assign({
              executionInput: ({ context, event }) =>
                context.executionInput
                  ? { ...context.executionInput, selectedFiatAccountId: event.selectedFiatAccountId }
                  : context.executionInput,
              postAuthTarget: undefined
            }),
            target: "RegisterRamp"
          }
        ],
        // This will trigger a quoteRefresher after some seconds
        REFRESH_FAILED: {
          actions: [{ type: "refreshQuoteActionWithDelay" }]
        },
        UPDATE_QUOTE: [
          {
            actions: assign({
              executionInput: ({ context, event }) =>
                context.executionInput ? { ...context.executionInput, quote: event.quote } : context.executionInput,
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
                executionInput: ({ context, event }) =>
                  context.executionInput ? { ...context.executionInput, quote: event.quote } : context.executionInput,
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
      // TODO alfredpay failure ends up here. We should handle a retry on it's own kyc state machine. Get the link again !
      always: {
        target: "Resetting"
      }
    },
    LoadingQuote: {
      invoke: {
        id: "loadQuote",
        input: ({ event, context }) => {
          const quoteId = event.type === "SET_QUOTE" ? event.quoteId : context.quoteId;
          if (!quoteId) {
            throw new Error("Quote ID is required to load quote.");
          }

          return { quoteId };
        },
        onDone: [
          {
            actions: assign({
              isQuoteExpired: ({ event }) => event.output.isExpired,
              postAuthTarget: () => "QuoteReady",
              quote: ({ event }) => event.output.quote
            }),
            target: "CheckAuth"
          }
        ],
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
      always: [
        {
          guard: ({ context }) => context.quoteId !== undefined && context.quote === undefined,
          target: "LoadingQuote"
        }
      ],
      entry: assign({
        rampSigningPhase: undefined,
        rampSigningPhaseCurrent: undefined,
        rampSigningPhaseMax: undefined
      }),
      on: {
        // This is the main confirm button.
        CONFIRM: {
          actions: assign({
            chainId: ({ event }) => event.input.chainId,
            executionInput: ({ event }) => event.input.executionInput,
            // Also reset any error from a previous attempt
            initializeFailedMessage: undefined,
            // Restore quote and quoteId if missing
            quote: ({ context, event }) => context.quote || event.input.executionInput.quote,
            quoteId: ({ context, event }) => context.quoteId || event.input.executionInput.quote.id,
            rampDirection: ({ event }) => event.input.rampDirection
          }),
          guard: ({ context, event }) => context.quoteId !== undefined || event.input.executionInput.quote !== undefined,
          target: "RampRequested"
        },
        GO_BACK: {
          actions: assign({
            quote: undefined,
            quoteId: undefined
          }),
          target: "Idle"
        },
        SET_QUOTE: {
          actions: assign({
            enteredViaForm: ({ event }) => event.enteredViaForm,
            quoteId: ({ event }) => event.quoteId,
            quoteLocked: ({ event }) => event.lock
          })
        },
        UPDATE_QUOTE: {
          actions: assign({
            executionInput: ({ context, event }) =>
              context.executionInput ? { ...context.executionInput, quote: event.quote } : context.executionInput,
            quote: ({ event }) => event.quote,
            quoteId: ({ event }) => event.quote.id
          })
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
            guard: ({ event }: { event: { output: { kycNeeded: boolean } } }) => event.output.kycNeeded,
            // The guard checks validateKyc output
            // do nothing otherwise, as we wait for modal confirmation.
            target: "KYC"
          },
          {
            // If Avenia (BRL) flow and user is valid, we can simply go to the summary card.
            guard: ({ context, event }) => !event.output.kycNeeded && context.executionInput?.fiatToken === FiatToken.BRL,
            target: "KycComplete"
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
          actions: [{ type: "setErrorMessage" }],
          target: "Error"
        },
        src: "registerRamp"
      }
    },
    RequestingOTP: {
      invoke: {
        input: ({ context }) => ({ context }),
        onDone: {
          target: "EnterOTP"
        },
        onError: {
          actions: assign({
            errorMessage: "Failed to send OTP. Please try again."
          }),
          target: "EnterEmail"
        },
        src: "requestOTP"
      },
      on: {
        GO_BACK: [
          {
            actions: assign({
              errorMessage: undefined
            }),
            guard: ({ context }) => context.postAuthTarget === "RegisterRamp",
            target: "KycComplete"
          },
          {
            actions: assign({
              enteredViaForm: undefined,
              errorMessage: undefined,
              postAuthTarget: undefined,
              quote: undefined,
              quoteId: undefined
            }),
            target: "Idle"
          }
        ]
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
          actions: [{ type: "setErrorMessage" }],
          target: "Error"
        },
        src: "startRamp"
      }
    },
    UpdateRamp: {
      invoke: {
        id: "signingActor",
        input: ({ self, context }) => ({ context, parent: self as RampMachineActor }),
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
            actions: [{ type: "setErrorMessage" }],
            target: "Error"
          }
        ],
        src: "signTransactions"
      },
      on: {
        GO_BACK: {
          actions: assign({
            enteredViaForm: undefined,
            errorMessage: undefined,
            rampPaymentConfirmed: false,
            rampSigningPhase: undefined,
            rampSigningPhaseCurrent: undefined,
            rampSigningPhaseMax: undefined
          }),
          target: "QuoteReady"
        },
        PAYMENT_CONFIRMED: {
          actions: assign({
            rampPaymentConfirmed: true
          }),
          target: "StartRamp"
        }
      }
    },
    VerifyingOTP: {
      invoke: {
        input: ({ context, event }) => {
          if (!context.userEmail) {
            throw new Error("Email is required to verify OTP.");
          }

          return {
            code: (event as Extract<RampMachineEvents, { type: "VERIFY_OTP" }>).code,
            email: context.userEmail
          };
        },
        onDone: [
          {
            actions: [
              assign({
                errorMessage: undefined,
                isAuthenticated: true,
                postAuthTarget: undefined,
                userId: ({ event }) => event.output.userId
              }),
              ({ event, context }) => {
                // Store tokens in localStorage for session persistence
                AuthService.storeTokens({
                  accessToken: event.output.accessToken,
                  refreshToken: event.output.refreshToken,
                  userEmail: context.userEmail,
                  userId: event.output.userId
                });
              }
            ],
            guard: ({ context }) => context.postAuthTarget === "RegisterRamp",
            target: "RegisterRamp"
          },
          {
            actions: [
              assign({
                errorMessage: undefined,
                isAuthenticated: true,
                postAuthTarget: undefined,
                userId: ({ event }) => event.output.userId
              }),
              ({ event, context }) => {
                // Store tokens in localStorage for session persistence
                AuthService.storeTokens({
                  accessToken: event.output.accessToken,
                  refreshToken: event.output.refreshToken,
                  userEmail: context.userEmail,
                  userId: event.output.userId
                });
              }
            ],
            target: "QuoteReady"
          }
        ],
        onError: {
          actions: assign({
            errorMessage: "Invalid OTP code. Please try again."
          }),
          target: "EnterOTP"
        },
        src: "verifyOTP"
      },
      on: {
        GO_BACK: {
          actions: assign({
            errorMessage: undefined
          }),
          target: "EnterEmail"
        }
      }
    }
  }
});
