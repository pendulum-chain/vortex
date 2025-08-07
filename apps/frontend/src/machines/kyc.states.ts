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

// Logic of the KYC node:
// The node attempts to abstract the generic "Started" -> "Verifying" -> "Done" flow of any KYC process.
// The "Verifying" state will invoke child actors based on the particula ramp.
// The output of these state-machine actors will always be assigned to the RampContext's `kycResponse` property.
export const kycStateNode = {
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
      exit: sendTo("stellarKyc", { type: "Cancel" }),
      invoke: {
        id: "stellarKyc",
        input: ({ context }: { context: RampContext }): StellarKycContext => context,
        onDone: [
          {
            actions: assign(({ context, event }: { context: RampContext; event: any }) => {
              console.log("Stellar KYC completed with response:", event.output);
              return {
                ...context,
                kycResponse: event.output.paymentData
              };
            }),
            guard: ({ event }: { event: any }) => !!event.output.paymentData,
            target: "VerificationComplete"
          },
          {
            // TODO we probably want to parse the KYC sub-process error before assigning it to the parent ramp state machine.
            actions: assign({
              error: ({ event }: { event: any }) => event.output.error
            }),
            target: "#ramp.Failure"
          }
        ],
        onError: {
          target: "#ramp.Failure"
        },
        src: "stellarKyc"
      }
    },
    VerificationComplete: {
      always: {
        target: "#ramp.RegisterRamp"
      },
      entry: {
        actions: [
          ({ context }: any) => {
            console.log("KYC verification completed successfully:", context.kycResponse);
          }
        ]
      }
    }
  }
};
