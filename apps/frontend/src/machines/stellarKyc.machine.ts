import { setup } from "xstate";
import { RampContext } from "./types";

export const stellarKycMachine = setup({
  types: {
    context: {} as RampContext,
    output: {} as RampContext
  }
}).createMachine({
  context: ({ input }) => input as RampContext,
  id: "stellarKyc",
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
