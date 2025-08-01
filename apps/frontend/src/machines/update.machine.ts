import { assign, setup } from "xstate";
import { signTransactionsActor } from "./actors/sign.actor";
import { RampContext } from "./types";

export const updateRampMachine = setup({
  actors: {
    signTransactions: signTransactionsActor
  },
  types: {
    context: {} as RampContext,
    output: {} as RampContext
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
  id: "updateRamp",
  initial: "started",
  output: ({ context }) => context,
  states: {
    signing: {
      invoke: {
        input: ({ context }) => context,
        onDone: {
          actions: assign({
            rampState: ({ event }) => event.output
          }),
          target: "signingSuccess"
        },
        onError: {
          target: "signingFailed"
        },
        src: "signTransactions"
      }
    },
    signingFailed: {
      type: "final"
    },
    signingSuccess: {
      type: "final"
    },
    started: {
      always: {
        target: "signing"
      }
    }
  }
});
