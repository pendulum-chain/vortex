import { FiatToken, PaymentData } from "@packages/shared";
import { assertEvent, assign, setup } from "xstate";
import { RampDirection } from "../components/RampToggle";
import { RampExecutionInput } from "../types/phases";
import { brlaKycMachine } from "./brlaKyc.machine";
import { moneriumKycMachine } from "./moneriumKyc.machine";
import { stellarKycMachine } from "./stellarKyc.machine";
import { RampContext } from "./types";

type RampKycContext = RampContext & {
  executionInput: RampExecutionInput;
  kycResponse?: PaymentData | any; // To store the output from the KYC actor
  error?: any;
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
  initial: "Started",
  output: ({ context }) => context,
  states: {
    Cancelled: {
      type: "final"
    },
    Failed: {
      type: "final"
    },
    KycDone: {
      type: "final"
    },
    Started: {
      always: "Verifying"
    },
    Verifying: {
      initial: "Deciding",
      onDone: [
        {
          guard: ({ event }) => (event.output as any)?.status === "Cancelled",
          target: "Cancelled"
        },
        {
          actions: assign({
            kycResponse: ({ event }) => {
              console.log("KYC process completed with response:", event.output);
              return event.output;
            }
          }),
          target: "KycDone"
        }
      ],
      states: {
        Brla: {
          invoke: {
            id: "brlaKyc",
            input: ({ context }) => ({ taxId: context.executionInput.taxId! }),
            onDone: {
              target: "VerificationComplete"
            },
            onError: {
              target: "Failed"
            },
            src: "brlaKyc"
          }
        },
        Deciding: {
          always: [
            {
              guard: ({ context }) => context.executionInput?.fiatToken === FiatToken.BRL,
              target: "Brla"
            },
            {
              guard: ({ context }) =>
                context.executionInput?.fiatToken === FiatToken.EURC && context.rampDirection === RampDirection.ONRAMP,
              target: "Monerium"
            },
            {
              target: "Stellar"
            }
          ]
        },
        Failed: {
          entry: ({ event }) => console.error("KYC failed within verifying state", event)
          // This will cause the top-level machine to enter its 'Failed' final state
          // because if a state configuration has no transitions
        },
        Monerium: {
          invoke: {
            id: "moneriumKyc",
            onDone: {
              target: "VerificationComplete"
            },
            onError: {
              target: "Failed"
            },
            src: "moneriumKyc"
          }
        },
        Stellar: {
          invoke: {
            id: "stellarKyc",
            input: ({ context }) => context,
            onDone: {
              target: "VerificationComplete"
            },
            onError: {
              actions: assign({
                error: ({ event }) => (event as any).data
              }),
              target: "Failed"
            },
            src: "stellarKyc"
          }
        },
        VerificationComplete: {
          type: "final"
        }
      }
    }
  }
});
