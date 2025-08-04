import { setup } from "xstate";
import { RampContext } from "./types";

export const brlaKycMachine = setup({
  types: {
    context: {} as RampContext,
    output: {} as RampContext
  }
}).createMachine({
  context: ({ input }) => input as RampContext,
  id: "brlaKyc",
  initial: "started",
  output: ({ context }) => context,
  states: {
    done: {
      type: "final"
    },
    started: {
      always: "verifying"
    },
    verifying: {
      always: "done"
    }
  }
});
