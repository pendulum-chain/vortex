import { assign, setup } from "xstate";
import { signTransactionsActor } from "./actors/sign.actor";
import { RampContext } from "./types";

export const updateRampMachine = setup({
  actors: {
    signTransactions: signTransactionsActor
  },
  types: {
    context: {} as RampContext,
    input: {} as RampContext,
    output: {} as RampContext
  }
}).createMachine({
  context: ({ input }) => input as RampContext,
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
