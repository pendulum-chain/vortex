import { FiatToken } from "@packages/shared";
import { setup } from "xstate";
import { RampDirection } from "../components/RampToggle";
import { RampExecutionInput } from "../types/phases";
import { brlaKycMachine } from "./brlaKyc.machine";
import { moneriumKycMachine } from "./moneriumKyc.machine";
import { stellarKycMachine } from "./stellarKyc.machine";
import { RampContext } from "./types";

type RampKycContext = RampContext & {
  executionInput: RampExecutionInput;
};

export const kycMachine = setup({
  actors: {
    brlaKyc: brlaKycMachine,
    moneriumKyc: moneriumKycMachine,
    stellarKyc: stellarKycMachine
  },
  types: {
    context: {} as RampKycContext,
    output: {} as RampContext
  }
}).createMachine({
  context: ({ input }) => input as RampKycContext,
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
            input: ({ context }) => ({ taxId: context.executionInput.taxId }),
            onDone: "kycDone", // TODO: again, executionInput cannot be undefined here.
            src: "brlaKyc"
          }
        },
        deciding: {
          always: [
            {
              guard: ({ context }) => context.executionInput?.fiatToken === FiatToken.BRL,
              target: "brla"
            },
            {
              guard: ({ context }) =>
                context.executionInput?.fiatToken === FiatToken.EURC && context.rampDirection === RampDirection.ONRAMP,
              target: "monerium"
            },
            {
              target: "stellar"
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
            input: ({ context }) => ({ taxId: context.executionInput.taxId }),
            onDone: "kycDone",
            src: "stellarKyc"
          }
        }
      }
    }
  }
});
