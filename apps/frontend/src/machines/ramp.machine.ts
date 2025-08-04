import { assign, fromPromise, setup } from "xstate";
import { RampDirection } from "../components/RampToggle";
import { RampExecutionInput } from "../types/phases";
import { registerRampActor } from "./actors/register.actor";
import { startRampActor } from "./actors/start.actor";
import { validateKycActor } from "./actors/validateKyc.actor";
import { kycMachine } from "./kyc.machine";
import { RampContext, RampState } from "./types";
import { updateRampMachine } from "./update.machine";

export const rampMachine = setup({
  actors: {
    registerRamp: fromPromise(registerRampActor), // TODO how can I strongly type this, instead of it beign defined by the impl? Like rust traits
    startRamp: startRampActor,
    validateKyc: fromPromise(validateKycActor)
  },
  types: {
    context: {} as RampContext,
    events: {} as
      | { type: "confirm" }
      | { type: "onDone"; output: RampState }
      | {
          type: "modifyExecutionInput";
          output: { executionInput: RampExecutionInput; chainId: number; rampDirection: RampDirection };
        }
  }
}).createMachine({
  context: {
    address: undefined,
    assethubApiComponents: undefined,
    authToken: undefined,
    canRegisterRamp: false,
    chainId: undefined,
    executionInput: undefined,
    getMessageSignature: undefined,
    initializeFailedMessage: undefined,
    moonbeamApiComponents: undefined,
    pendulumApiComponents: undefined,
    rampDirection: undefined,
    rampExecutionInput: undefined,
    rampKycLevel2Started: false,
    rampKycStarted: false,
    rampPaymentConfirmed: false,
    rampSigningPhase: undefined,
    rampState: undefined,
    rampSummaryVisible: false,
    signingRejected: false,
    substrateWalletAccount: undefined
  },
  id: "ramp",
  initial: "Idle",
  states: {
    Failure: {},
    Idle: {
      on: {
        confirm: "RampRequested",
        modifyExecutionInput: {
          actions: assign(({ context, event }) => {
            context.executionInput = event.output.executionInput;
            context.chainId = event.output.chainId;
            context.rampDirection = event.output.rampDirection;
            return context;
          })
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
      invoke: {
        input: ({ context }) => context,
        onDone: [
          {
            // The guard checks validateKyc output
            guard: ({ event }) => !event.output.kycNeeded,
            target: "RegisterRamp"
          },
          {
            // Fallback. Go to child state machine "KYC"
            target: "KYC"
          }
        ],
        onError: "Failure",
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
