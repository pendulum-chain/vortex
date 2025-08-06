import { FiatToken, PaymentData } from "@packages/shared";
import { assign, sendTo } from "xstate";
import { RampDirection } from "../components/RampToggle";
import { RampContext } from "./types";

// Extended context types for child KYC machines
export interface BrlaKycContext extends RampContext {
  taxId: string;
}

export interface MoneriumKycContext extends RampContext {
  // TODO
}

export interface StellarKycContext extends RampContext {
  token?: string;
  sep10Account?: any;
  paymentData?: PaymentData;
  redirectUrl?: string;
  tomlValues?: any;
  id?: string;
  error?: any;
}

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
            // TODO I would prefer to have this uncoupled from the specific implementations, and based on active child.
            sendTo(
              ({ context }) => {
                if (context.executionInput?.fiatToken === FiatToken.BRL) {
                  return "brlaKyc";
                }
                if (context.executionInput?.fiatToken === FiatToken.EURC && context.rampDirection === RampDirection.ONRAMP) {
                  return "moneriumKyc";
                }
                return "stellarKyc";
              },
              { type: "SummaryConfirm" }
            ),
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
            input: ({ context }: { context: RampContext }): BrlaKycContext => ({
              ...context,
              taxId: context.executionInput!.taxId!
            }),
            onDone: {
              target: "VerificationComplete"
            },
            src: "brlaKyc"
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
            input: ({ context }: { context: RampContext }): MoneriumKycContext => context,
            onDone: {
              target: "VerificationComplete"
            },
            src: "moneriumKyc"
          }
        },
        Stellar: {
          invoke: {
            id: "stellarKyc",
            input: ({ context }: { context: RampContext }): StellarKycContext => context,
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
          }
        },
        VerificationComplete: {
          type: "final"
        }
      }
    }
  }
};
