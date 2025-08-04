import { assign, fromPromise, setup } from "xstate";
import { RampExecutionInput } from "../types/phases";
import { registerRampActor } from "./actors/register.actor";
import { startRampActor } from "./actors/start.actor";
import { RampContext, RampState } from "./types";
import { updateRampMachine } from "./update.machine";

export const rampMachine = setup({
  actors: {
    registerRamp: fromPromise(registerRampActor), // TODO how can I strongly type this, instead of it beign defined by the impl? Like rust traits
    startRamp: startRampActor,
    // TODO implement the actual KYC validation logic
    validateKyc: fromPromise(async ({ input }: { input: RampContext }) => {
      console.log(`Performing async KYC validation for user: ${input}...`);
      return true;
    })
  },
  types: {
    context: {} as RampContext,
    events: {} as
      | { type: "confirm" }
      | { type: "onDone"; output: RampState }
      | { type: "modifyExecutionInput"; output: RampExecutionInput }
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
            if (event.type === "modifyExecutionInput") {
              return { executionInput: event.output };
            }
            return context;
          })
        }
      }
    },
    KYC: {},
    RampFollowUp: {},
    RampRequested: {
      invoke: {
        input: ({ context }) => context,
        onDone: [
          {
            // The guard checks validateKyc output
            guard: ({ event }) => event.output === true,
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
