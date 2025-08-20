import { RampDirection } from "@packages/shared";
import { assign, emit, fromPromise, setup } from "xstate";
import { ToastMessage } from "../helpers/notifications";
import { KYCFormData } from "../hooks/brla/useKYCForm";
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

const initialRampContext: RampContext = {
  address: undefined,
  authToken: undefined,
  chainId: undefined,
  executionInput: undefined,
  getMessageSignature: undefined,
  initializeFailedMessage: undefined,
  isQuoteExpired: false,
  paymentData: undefined,
  rampDirection: undefined,
  rampKycLevel2Started: false,
  rampKycStarted: false,
  rampPaymentConfirmed: false,
  rampSigningPhase: undefined,
  rampState: undefined,
  rampSummaryVisible: false,
  stuff: undefined,
  substrateWalletAccount: undefined
};

export type RampMachineEvents =
  | { type: "CONFIRM"; input: { executionInput: RampExecutionInput; chainId: number; rampDirection: RampDirection } }
  | { type: "CANCEL_RAMP" }
  | { type: "onDone"; input: RampState }
  | { type: "SET_ADDRESS"; address: string | undefined }
  | { type: "SET_GET_MESSAGE_SIGNATURE"; getMessageSignature: GetMessageSignatureCallback | undefined }
  | { type: "SubmitLevel1"; formData: KYCFormData } // TODO: We should allow by default all child events
  | { type: "SummaryConfirm" }
  | { type: "SIGNING_UPDATE"; phase: RampSigningPhase | undefined }
  | { type: "PAYMENT_CONFIRMED" }
  | { type: "SET_RAMP_STATE"; rampState: RampState }
  | { type: "RESET_RAMP" }
  | { type: "FINISH_OFFRAMPING" }
  | { type: "SHOW_ERROR_TOAST"; message: ToastMessage }
  | { type: "SET_INITIALIZE_FAILED_MESSAGE"; message: string | undefined };

export const rampMachine = setup({
  actions: {
    resetRamp: assign(({ context }) => ({
      ...initialRampContext,
      address: context.address,
      authToken: context.authToken,
      initializeFailedMessage: context.initializeFailedMessage
    })),
    setFailedMessage: assign({
      initializeFailedMessage: () => "Ramp failed, please retry"
    }),
    showSigningRejectedErrorToast: emit({ message: ToastMessage.SIGNING_REJECTED, type: "SHOW_ERROR_TOAST" })
  },
  actors: {
    aveniaKyc: aveniaKycMachine,
    moneriumKyc: moneriumKycMachine,
    registerRamp: fromPromise(registerRampActor),
    signTransactions: fromPromise(signTransactionsActor),
    startRamp: fromPromise(startRampActor),
    stellarKyc: stellarKycMachine,
    validateKyc: fromPromise(validateKycActor)
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
    CANCEL_RAMP: {
      target: ".Cancel"
    },
    SET_ADDRESS: {
      actions: assign({
        address: ({ event }: any) => event.address
      })
    },
    SET_GET_MESSAGE_SIGNATURE: {
      actions: assign({
        getMessageSignature: ({ event }: any) => event.getMessageSignature
      })
    },
    SET_INITIALIZE_FAILED_MESSAGE: {
      actions: assign({
        initializeFailedMessage: ({ event }: any) => event.message
      })
    },
    SIGNING_UPDATE: {
      actions: assign({ rampSigningPhase: ({ event }: any) => event.phase })
    }
  },
  states: {
    Cancel: {
      always: {
        target: "#ramp.Idle"
      },
      entry: assign(({ context }) => ({
        ...initialRampContext,
        address: context.address,
        authToken: context.authToken
      }))
    },
    Failure: {
      // TODO We also need to display the "final" error message in the UI.
      entry: assign(({ context }) => ({
        ...initialRampContext,
        address: context.address,
        authToken: context.authToken
      })),
      on: {
        FINISH_OFFRAMPING: {
          actions: "resetRamp",
          target: "#ramp.Idle"
        }
      }
    },
    Idle: {
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
        },
        RESET_RAMP: {
          actions: "resetRamp"
        }
      }
    },
    KYC: kycStateNode as any,
    KycFailure: {
      always: {
        target: "Idle"
      },
      // So far, we only go back to main component
      entry: "resetRamp"
    },
    RampFollowUp: {
      on: {
        FINISH_OFFRAMPING: {
          actions: "resetRamp",
          target: "Idle"
        },
        SET_RAMP_STATE: {
          actions: assign({
            rampState: ({ event }) => event.rampState
          })
        }
      }
    },
    RampRequested: {
      entry: assign({
        rampSummaryVisible: true // TODO maybe we can get rid and just match this state and RampRequested, etc.
      }),
      invoke: {
        input: ({ context }) => context,
        onDone: {
          guard: ({ event }: any) => event.output.kycNeeded,
          // The guard checks validateKyc output
          // do nothing otherwise, as we wait for modal confirmation.
          target: "KYC"
        },
        onError: "Idle",
        src: "validateKyc"
      },
      on: {
        SummaryConfirm: {
          target: "RegisterRamp"
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
          actions: [{ type: "setFailedMessage" }, { type: "resetRamp" }],
          target: "Idle"
        },
        src: "registerRamp"
      }
    },
    StartRamp: {
      invoke: {
        input: ({ context }) => context,
        onDone: {
          target: "RampFollowUp"
        },
        onError: {
          actions: [{ type: "setFailedMessage" }, { type: "resetRamp" }],
          target: "Idle"
        },
        src: "startRamp"
      }
    },
    UpdateRamp: {
      invoke: {
        id: "signingActor",
        input: ({ self, context }) => ({ context, parent: self }),
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
            actions: [{ type: "showSigningRejectedErrorToast" }, { type: "resetRamp" }],
            // The user rejected the signature
            guard: ({ event }) => event.error instanceof SignRampError && event.error.type === SignRampErrorType.UserRejected,
            target: "Idle"
          },
          {
            actions: [{ type: "resetRamp" }],
            // Handle other errors
            target: "Idle"
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
