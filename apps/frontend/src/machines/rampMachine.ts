import { assign, createMachine, fromPromise, PromiseActorLogic, setup } from "xstate";
import { registerRampActor } from "./actors/register.actor";
import { RampContext, RampState } from "./types";

const rampActor = fromPromise(registerRampActor);

export const rampMachine = setup({
  actors: {
    registerRamp: fromPromise(registerRampActor), // TODO how can I strongly type this, instead of it beign defined by the impl? Like rust traits
    // TODO implement the actual KYC validation logic
    validateKyc: fromPromise(async ({ input }: { input: RampContext }) => {
      console.log(`Performing async KYC validation for user: ${input}...`);
      return true;
    })
  },
  types: {
    context: {} as RampContext,
    events: {} as { type: "confirm" } | { type: "onDone"; output: RampState }
  }
}).createMachine({
  context: {
    address: undefined,
    authToken: undefined,
    canRegisterRamp: false,
    chainId: undefined,
    executionInput: undefined,
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
    signingRejected: false
  },
  id: "ramp",
  initial: "Idle",
  states: {
    Failure: {},
    Idle: {
      on: { confirm: "RampRequested" }
    },
    KYC: {},
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
    UpdateRamp: {}
  }
});
