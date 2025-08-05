import { assign, fromPromise, setup } from "xstate";
import { RampDirection } from "../components/RampToggle";
import { ApiComponents } from "../contexts/polkadotNode";
import { UseSiweContext } from "../contexts/siwe";
import { KYCFormData } from "../hooks/brla/useKYCForm";
import { RampExecutionInput } from "../types/phases";
import { registerRampActor } from "./actors/register.actor";
import { startRampActor } from "./actors/start.actor";
import { validateKycActor } from "./actors/validateKyc.actor";
import { kycMachine } from "./kyc.machine";
import { GetMessageSignatureCallback, RampContext, RampState } from "./types";
import { updateRampMachine } from "./update.machine";

export const rampMachine = setup({
  actors: {
    registerRamp: fromPromise(registerRampActor), // TODO how can I strongly type this, instead of it beign defined by the impl? Like rust traits
    startRamp: fromPromise(startRampActor),
    validateKyc: fromPromise(validateKycActor)
  },
  types: {
    context: {} as RampContext,
    events: {} as
      | { type: "confirm"; input: { executionInput: RampExecutionInput; chainId: number; rampDirection: RampDirection } }
      | { type: "onDone"; input: RampState }
      | { type: "onRampConfirm" }
      | { type: "SET_SIWE_CONTEXT"; siwe: UseSiweContext }
      | { type: "SET_ADDRESS"; address: string | undefined }
      | { type: "SET_GET_MESSAGE_SIGNATURE"; getMessageSignature: GetMessageSignatureCallback }
      | {
          type: "SET_API_COMPONENTS";
          pendulumApiComponents: ApiComponents;
          moonbeamApiComponents: ApiComponents;
          assethubApiComponents: ApiComponents;
        }
      | { type: "SubmitLevel1"; formData: KYCFormData } // TODO: We should allow by default all child events
  }
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QCcCGBbADgYgMoFEAVAfVwEkB1fYgYQHkA5Q-ADUIG0AGAXUVEwD2sAJYAXYQIB2fEAA9EARgBMAdgUA6TgFZOKgGxalSg3pUAOADQgAnogDMnDXa0BOACyGFnXWbt29AL4BVmhYeETEAIIAItEASvi4uFy8SCCCIuJSMvIIyu7qbgpunCVavgrlela2CEql6i6ceg7F3oZGbkEhGDgEJADiEQCyibiRQ6RkAwyRhACqCSkyGWIS0mm5ykou6krFZkp++i7ldjWKnGaFWnaVut7GCsrdIKF9EZEACmS0dMNfRj4JjJHgrIRrbKbRRKVzqcxaBTOEouQ5mao2GGvd7qMgQAA2YGwAGMpAAzYTIdDLNKrLIbUBbBzqHTeK4qLR6FpuFRuC4INwuJTqMwqfTlXnNNx6MzY3rqADSAE0aNgIFIwOphJIAG4CADWmpxypoCG1euJqHpKRp-Ah9JyiBcCl2xk5xR5Yu8Cn5LV2Kh2dnqLS0KhcKjlWHUcV6cTAAEcAK5wUSQNUarW6g1G+UxrBxpMpyBmrOW608W3pe3rR0CvQaEp6WEtTiw558zEC06NMPGXk7MynWXBN652MJ5OwVMQdOSTXm7PqHF5zAFyfTksWq3rG0KVJ2zI16F1hvNZsONvFX12f2B4POMMRkfL8eFqdpsDIZACZDqTD4q0yR-dAlzHfMJyLCBNwEMsdwrMFaWrKFGUQaVTybTkL0RK9O3MYUeRcOwVDsMwij0VEFEjTBozAKBhHfZAV1necs0NUCozjOiGJXaDYKkG0EIPSEGTkRQeS0EVTA9F03DsWSO1qHk7BFfxWy8QizlMKiaK41NGN6bBP2-X9-0A4D2Oozj6L0niFz4yQBP3KtD2Q0S8nEyS1DcIp3DkuTfUFdQ7lhcxeX0SotG03BRFQZBRCY9U50zPU2JxaLYvi3peO3fj4KcukjxQuoiM4TQjiItx0URThnH5SrhU5J5BQ8fwumfeV0ripijJ-P8ANEICqQs9ROsyrBsvLbhKwK1zciOFRStbY5KoMLxas7W5FowpozCRW4FECdqo3mTAICtMAEozBdUvlE6ztTWzSxyhy8vBFyRK2CpChlNQ7maAxQzq4iVL0NTOA03wtNeSQBAgOAZHeN7hNrABaH1OxItwRWUUGlDMRxSg8bSADFUGEfFE2QMAkYdY9YVklkIrUIVeXrALrmCwxOeaJFtLxQkacKtyeX5RE9CCrQfO0OSkUI7STUF2bEA5CT6juLxylcIpfUqPYdlhW4-TDQ6eg43piYEfF8QEAB3E7FY+xB6eUxEtFDF1VDQurdpZJsAd0bDOW0lc10gh3ayUQKikbBRzAcMw3ZUOqhRFSXVC5IiFF2lxg9o6zPxXcPjxx4UdhlbzY4DNnOxW32ngW+tymMKKYq63oi6K-ZeUKFxe7cPGzwOrQgeFYKWmUWS1A5bS7vOwvEPe2sDtMQoz3B-ZKpcAwR6CnHgsn2PIqCAIgA */
  context: {
    address: undefined,
    assethubApiComponents: undefined,
    authToken: undefined,
    chainId: undefined,
    executionInput: undefined,
    getMessageSignature: undefined,
    initializeFailedMessage: undefined,
    moonbeamApiComponents: undefined,
    pendulumApiComponents: undefined,
    rampDirection: undefined,
    rampKycLevel2Started: false,
    rampKycStarted: false,
    rampPaymentConfirmed: false,
    rampSigningPhase: undefined,
    rampState: undefined,
    rampSummaryVisible: false,
    siwe: undefined,
    substrateWalletAccount: undefined
  },
  id: "ramp",
  initial: "Idle",
  on: {
    SET_ADDRESS: {
      actions: assign({
        address: ({ event }) => event.address
      })
    },
    SET_API_COMPONENTS: {
      actions: assign({
        assethubApiComponents: ({ event }) => event.assethubApiComponents,
        moonbeamApiComponents: ({ event }) => event.moonbeamApiComponents,
        pendulumApiComponents: ({ event }) => event.pendulumApiComponents
      })
    },
    SET_GET_MESSAGE_SIGNATURE: {
      actions: assign({
        getMessageSignature: ({ event }) => event.getMessageSignature
      })
    },
    SET_SIWE_CONTEXT: {
      actions: assign({
        siwe: ({ event }) => event.siwe
      })
    }
  },
  states: {
    Failure: {},
    Idle: {
      on: {
        confirm: {
          actions: assign(({ context, event }) => {
            context.executionInput = event.input.executionInput;
            context.chainId = event.input.chainId;
            context.rampDirection = event.input.rampDirection;
            return context;
          }),
          target: "RampRequested"
        }
      }
    },
    KYC: {
      invoke: {
        input: ({ context }) => context,
        onDone: {
          target: "RegisterRamp"
        },
        src: kycMachine
      }
    },
    RampFollowUp: {},
    RampRequested: {
      entry: assign(({ context }) => {
        context.rampSummaryVisible = true;
        return context;
      }),
      invoke: {
        input: ({ context }) => context,
        onDone: [
          // The guard checks validateKyc output
          // do nothing otherwise, as we wait for modal confirmation.
          {
            //Go to child state machine "KYC"
            guard: ({ event }) => event.output.kycNeeded,
            target: "KYC"
          }
        ],
        onError: "Failure",
        onRampConfirm: {
          target: "RegisterRamp"
        },
        src: "validateKyc"
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
        onError: "Failure",
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
          target: "Failure"
        },
        src: "startRamp"
      }
    },
    UpdateRamp: {
      invoke: {
        input: ({ context }: { context: RampContext }) => context,
        onDone: {
          // an event in this state, only then it should transition to StartRamp
          actions: assign(({ context, event }) => {
            context = event.output as RampContext; // TODO: we define the output, why is this not typed?
            return context;
          }), // TODO add guard to check if the payment was confirmed ONLY FOR ONRAMPS. That UI element should trigger
          target: "StartRamp"
        },
        src: updateRampMachine
      }
    }
  }
});
