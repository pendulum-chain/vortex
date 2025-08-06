import { FiatToken } from "@packages/shared";
import { assign, sendTo } from "xstate";
import { RampDirection } from "../components/RampToggle";
import { RampContext } from "./types";

export const kycStateNode = {
  initial: "Started",
  states: {
    Started: {
      always: "Verifying"
    },
    Verifying: {
      initial: "Deciding",
      on: {
        SummaryConfirm: {
          actions: [
            sendTo("stellarKyc", { type: "SummaryConfirm" }),
            ({ event }: any) => {
              console.log("SummaryConfirm event:", event);
            }
          ]
        }
      },
      // onDone is used to handle the completion of the child state (VerificationComplete)
      onDone: [
        {
          guard: ({ event }: { event: { output: any } }) => (event.output as any)?.status === "Cancelled",
          target: "#ramp.Cancel" // Target ramp machine's Cancel state
        },
        {
          actions: assign({
            kycResponse: ({ event }: { event: { output: any } }) => {
              console.log("KYC process completed with response:", event.output);
              return event.output;
            }
          }),
          target: "#ramp.RegisterRamp" // Target ramp machine's RegisterRamp state
        }
      ],
      // onError is for handling errors from invoked actors within this state
      onError: {
        target: "#ramp.Failure"
      },
      states: {
        Brla: {
          invoke: {
            id: "brlaKyc",
            input: ({ context }: { context: RampContext }) => ({
              taxId: context.executionInput!.taxId!
            }),
            onDone: {
              target: "VerificationComplete"
            },
            src: "brlaKyc"
          },
          on: {
            SummaryConfirm: {
              actions: [sendTo("brlaKyc", { type: "SummaryConfirm" })]
            }
          }
        },
        Deciding: {
          always: [
            {
              guard: ({ context }: { context: RampContext }) => context.executionInput?.fiatToken === FiatToken.BRL,
              target: "Brla"
            },
            {
              guard: ({ context }: { context: RampContext }) =>
                context.executionInput?.fiatToken === FiatToken.EURC && context.rampDirection === RampDirection.ONRAMP,
              target: "Monerium"
            },
            {
              target: "Stellar"
            }
          ]
        },
        Monerium: {
          invoke: {
            id: "moneriumKyc",
            onDone: {
              target: "VerificationComplete"
            },
            src: "moneriumKyc"
          },
          on: {
            SummaryConfirm: {
              actions: [
                sendTo("moneriumKyc", { type: "SummaryConfirm" }),
                ({ event }: any) => {
                  console.log("Monerium SummaryConfirm event:", event);
                }
              ]
            }
          }
        },
        Stellar: {
          invoke: {
            id: "stellarKyc",
            input: ({ context }: { context: RampContext }) => context,
            onDone: {
              target: "VerificationComplete"
            },
            onError: {
              actions: assign({
                error: ({ event }) => (event as any).data
              })
              // The onError of the parent 'Verifying' state will handle the transition to failure
            },
            src: "stellarKyc"
          },
          on: {
            SummaryConfirm: {
              actions: [sendTo("stellarKyc", { type: "SummaryConfirm" })]
            }
          }
        },
        VerificationComplete: {
          type: "final"
        }
      }
    }
  }
};
