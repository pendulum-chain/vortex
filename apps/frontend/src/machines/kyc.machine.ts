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
    kycDone: {
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
            // Asign taxId as initial input, from the swap form.
            input: ({ context }) => ({ taxId: context.executionInput!.taxId }),
            onDone: "kycDone", // TODO: again, executionInput cannot be undefined here.
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
            onDone: "kycDone",
            src: "moneriumKyc"
          }
        },
        stellar: {
          invoke: {
            onDone: "kycDone",
            src: "stellarKyc"
          }
        }
      }
    }
  }
});
