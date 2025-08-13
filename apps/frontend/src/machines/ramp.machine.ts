import { RampProcess } from "@packages/shared";
import { assign, fromPromise, setup } from "xstate";
import { RampDirection } from "../components/RampToggle";
import { UseSiweContext } from "../contexts/siwe";
import { ToastMessage } from "../helpers/notifications";
import { KYCFormData } from "../hooks/brla/useKYCForm";
import { RampExecutionInput, RampSigningPhase } from "../types/phases";
import { registerRampActor } from "./actors/register.actor";
import { SignRampError, SignRampErrorType, signTransactionsActor } from "./actors/sign.actor";
import { startRampActor } from "./actors/start.actor";
import { validateKycActor } from "./actors/validateKyc.actor";
import { brlaKycMachine } from "./brlaKyc.machine";
import { kycStateNode } from "./kyc.states";
import { moneriumKycMachine } from "./moneriumKyc.machine";
import { stellarKycMachine } from "./stellarKyc.machine";
import { DisplayUserRejectError, GetMessageSignatureCallback, RampContext, RampState } from "./types";

const initialRampContext: RampContext = {
  address: undefined,
  authToken: undefined,
  chainId: undefined,
  displayUserRejectError: undefined,
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
  siwe: undefined,
  stuff: undefined,
  substrateWalletAccount: undefined
};

export type RampMachineEvents =
  | { type: "Confirm"; input: { executionInput: RampExecutionInput; chainId: number; rampDirection: RampDirection } }
  | { type: "CANCEL_RAMP" }
  | { type: "onDone"; input: RampState }
  | { type: "SET_SIWE_CONTEXT"; siwe: UseSiweContext }
  | { type: "SET_ADDRESS"; address: string | undefined }
  | { type: "SET_GET_MESSAGE_SIGNATURE"; getMessageSignature: GetMessageSignatureCallback | undefined }
  | { type: "SubmitLevel1"; formData: KYCFormData } // TODO: We should allow by default all child events
  | { type: "SummaryConfirm" }
  | { type: "SIGNING_UPDATE"; phase: RampSigningPhase | undefined }
  | { type: "PAYMENT_CONFIRMED" }
  | { type: "SET_RAMP_STATE"; rampState: RampState }
  | { type: "SET_RAMP_EXECUTION_INPUT"; executionInput: RampExecutionInput }
  | { type: "RESET_RAMP" }
  | { type: "FINISH_OFFRAMPING" }
  | { type: "SET_DISPLAY_USER_REJECT_ERROR"; implementation: DisplayUserRejectError };

export const rampMachine = setup({
  actions: {
    displaySignRejectError: () => Promise<void>,
    resetRamp: assign(({ context }) => ({
      ...initialRampContext,
      address: context.address,
      authToken: context.authToken
    })),
    setFailedMessage: assign({
      initializeFailedMessage: () => "Ramp failed, please retry"
    })
  },
  actors: {
    brlaKyc: brlaKycMachine, // TODO how can I strongly type this, instead of it beign defined by the impl? Like rust traits
    moneriumKyc: moneriumKycMachine,
    registerRamp: fromPromise(registerRampActor),
    signTransactions: fromPromise(signTransactionsActor),
    startRamp: fromPromise(startRampActor),
    stellarKyc: stellarKycMachine,
    validateKyc: fromPromise(validateKycActor)
  },
  types: {
    context: {} as RampContext,
    events: {} as RampMachineEvents
  }
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QCcCGBbADgYgMoFEAVAfVwEkB1fYgYQHkA5Q-ADUIG0AGAXUVEwD2sAJYAXYQIB2fEAA9EARgBMAdgUA6TgFZOKgGxalSg3pUAOADQgAnogDMnDXa0BOACyGFnXWbt29AL4BVmhYeETEAIIAItEASvi4uFy8SCCCIuJSMvIIyu7qbgpunCVavgrlela2CEql6i6ceg7F3oZGbkEhGDgEJADiEQCyibiRQ6RkAwyRhACqCSkyGWIS0mm5ykou6krFZkp++i7ldjWKnGaFWnaVut7GCsrdIKF9EZEACmS0dMNfRj4JjJHgrIRrbKbRRKVzqcxaBTOEouQ5mao2GGvd7qMgQAA2YGwAGMpAAzYTIdDLNKrLIbUBbBzqHTeK4qLR6FpuFRuC4INwuJTqMwqfTlXnNNx6MzY3rqADSAE0aNgIFIwOphJIAG4CADWmpxypoCG1euJqHpKRp-Ah9JyiBcCl2xk5xR5Yu8Cn5LV2Kh2dnqLS0KhcKjlWHUcV6cTAAEcAK5wUSQNUarW6g1G+UxrBxpMpyBmrOW608W3pe3rR0CvQaEp6WEtTiw558zEC06NMPGXk7MynWXBN652MJ5OwVMQdOSTXm7PqHF5zAFyfTksWq3rG0KVJ2zI16F1hvNZsONvFX12f2B4POMMRkfL8eFqdpsDIZACZDqTD4q0yR-dAlzHfMJyLCBNwEMsdwrMFaWrKFGUQaVTybTkL0RK9O3MYUeRcOwVDsMwij0VEFEjTBozAKBhHfZAV1necs0NUCozjOiGJXaDYKkG0EIPSEGTkRQeS0EVTA9F03DsWSO1qHk7BFfxWy8QizlMKiaK41NGN6bBP2-X9-0A4D2Oozj6L0niFz4yQBP3KtD2Q0S8nEyS1DcIp3DkuTfUFdQ7lhcxeX0SotG03BRFQZBRCY9U50zPU2JxaLYvi3peO3fj4KcukjxQuoiM4TQjiItx0URThnH5SrhU5J5BQ8fwumfeV0ripijJ-P8ANEICqQs9ROsyrBsvLbhKwK1zciOFRStbY5KoMLxas7W5FowpozCRW4FECdqo3mTAICtMAEozBdUvlE6ztTWzSxyhy8vBFyRK2CpChlNQ7maAxQzq4iVL0NTOA03wtNeSQBAgOAZHeN7hNrABaH1OxItwRWUUGlDMRxSg8bSADFUGEfFE2QMAkYdY9YVklkIrUIVeXrALrmCwxOeaJFtLxQkacKtyeX5RE9CCrQfO0OSkUI7STUF2bEA5CT6juLxylcIpfUqPYdlhW4-TDQ6eg43piYEfF8QEAB3E7FY+xB6eUxEtFDF1VDQurdpZJsAd0bDOW0lc10gh3ayUQKikbBRzAcMw3ZUOqhRFSXVC5IiFF2lxg9o6zPxXcPjxx4UdhlbzY4DNnOxW32ngW+tymMKKYq63oi6K-ZeUKFxe7cPGzwOrQgeFYKWmUWS1A5bS7vOwvEPe2sDtMQoz3B-ZKpcAwR6CnHgsn2PIqCAIgA */
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
    SET_DISPLAY_USER_REJECT_ERROR: {
      actions: assign({
        displayUserRejectError: ({ event }: any) => event.displayUserRejectError
      })
    },
    SET_GET_MESSAGE_SIGNATURE: {
      actions: assign({
        getMessageSignature: ({ event }: any) => event.getMessageSignature
      })
    },
    SET_SIWE_CONTEXT: {
      actions: assign({
        siwe: ({ event }: any) => event.siwe // TODO this must be set using input, for serialization.
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
          target: "#ramp.Idle"
        }
      }
    },
    Idle: {
      on: {
        // This is the main confirm button.
        Confirm: {
          actions: assign({
            chainId: ({ event }) => event.input.chainId,
            executionInput: ({ event }) => event.input.executionInput,
            rampDirection: ({ event }) => event.input.rampDirection
          }),
          target: "RampRequested"
        },
        RESET_RAMP: {
          actions: assign(({ context }) => ({
            ...initialRampContext,
            address: context.address,
            authToken: context.authToken
          })) // WHY can't I assign it like the others?
        },
        SET_RAMP_EXECUTION_INPUT: {
          actions: assign({
            executionInput: ({ event }: any) => event.executionInput
          })
        }
      }
    },
    KYC: kycStateNode as any,
    KycFailure: {
      always: {
        target: "Idle"
      },
      // So far, we only go back to main component
      entry: assign(({ context }) => ({
        ...initialRampContext,
        address: context.address,
        authToken: context.authToken
      }))
    },
    RampFollowUp: {
      on: {
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
        onDone: {
          actions: assign({
            rampState: ({ event }) => event.output as RampState
          })
        },
        onError: [
          {
            actions: [
              ({ event }) => {
                console.log("User rejected signing:", event.error);
              },
              ({ context }) => {
                context.displayUserRejectError?.(ToastMessage.SIGNING_REJECTED);
              },
              { type: "resetRamp" }
            ],
            guard: ({ event }) => event.error instanceof SignRampError && event.error.type === SignRampErrorType.UserRejected,
            target: "Idle"
          },
          {
            actions: [{ type: "resetRamp" }],
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
