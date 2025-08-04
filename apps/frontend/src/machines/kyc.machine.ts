import { setup } from "xstate";
import { RampDirection } from "../components/RampToggle";
import { brlaKycMachine } from "./brlaKyc.machine";
import { moneriumKycMachine } from "./moneriumKyc.machine";
import { stellarKycMachine } from "./stellarKyc.machine";
import { RampContext } from "./types";

export const kycMachine = setup({
  actors: {
    brlaKyc: brlaKycMachine,
    moneriumKyc: moneriumKycMachine,
    stellarKyc: stellarKycMachine
  },
  types: {
    context: {} as RampContext,
    output: {} as RampContext
  }
}).createMachine({
  context: ({ input }) => input as RampContext,
  id: "kyc",
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
      initial: "deciding",
      states: {
        brla: {
          invoke: {
            onDone: "#kyc.done",
            src: "brlaKyc"
          }
        },
        deciding: {
          always: [
            {
              guard: ({ context }) => context.rampDirection === RampDirection.ONRAMP,
              target: "brla"
            },
            {
              guard: ({ context }) => context.rampDirection === RampDirection.OFFRAMP,
              target: "stellar"
            },
            {
              target: "monerium"
            }
          ]
        },
        monerium: {
          invoke: {
            onDone: "#kyc.done",
            src: "moneriumKyc"
          }
        },
        stellar: {
          invoke: {
            onDone: "#kyc.done",
            src: "stellarKyc"
          }
        }
      }
    }
  }
});
