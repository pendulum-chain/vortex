import { PaymentData } from "@packages/shared";
import { assign, sendTo, setup } from "xstate";
import { sep24SecondActor } from "./actors/stellar/sep24Second.actor";
import { startSep24Actor } from "./actors/stellar/startSep24.actor";
import { StellarKycContext } from "./kyc.states";
import { RampContext } from "./types";

export const stellarKycMachine = setup({
  actors: {
    sep24Second: sep24SecondActor,
    startSep24: startSep24Actor
  },
  types: {
    context: {} as StellarKycContext,
    events: {} as
      | { type: "SummaryConfirm" }
      | { type: "URL_UPDATED"; url: string; id: string }
      | {
          type: "SEP24_STARTED";
          output: { token: string; sep10Account: any; tomlValues: any };
        }
      | { type: "SEP24_FAILED"; error: any }
      | { type: "INTERVAL_STARTED"; intervalId: NodeJS.Timeout }
      | { type: "Cancel"; output: PaymentData },
    input: {} as RampContext,
    output: {} as { error?: any; paymentData?: PaymentData }
  }
}).createMachine({
  context: ({ input }) => ({
    ...input,
    redirectUrl: undefined,
    sep24IntervalId: undefined
  }),
  id: "stellarKyc",
  initial: "StartSep24",
  output: ({ context }) => ({
    error: context.error,
    paymentData: context.paymentData
  }),
  states: {
    Done: {
      type: "final"
    },
    Failed: {
      type: "final"
    },
    Sep24Second: {
      // TODO important, why this invoked actor does not STOP after we exit this state?
      invoke: {
        input: ({ context }) => ({
          ...context,
          id: context.id!,
          token: context.token!,
          tomlValues: context.tomlValues!,
          url: context.redirectUrl!
        }),
        onDone: {
          actions: [
            assign({
              paymentData: ({ event }) => event.output
            })
          ],
          target: "Done"
        },
        onError: {
          actions: [
            assign({
              error: ({ event }) => event.error
            }),
            ({ context, event }) => {
              console.log("context after error: ", context, "event : ", event);
            }
          ],
          target: "Failed"
        },
        src: "sep24Second"
      }
    },
    StartSep24: {
      invoke: {
        id: "startSep24Actor",
        input: ({ context }) => context,
        src: "startSep24"
      },
      on: {
        INTERVAL_STARTED: {
          actions: assign({
            sep24IntervalId: ({ event }) => event.intervalId
          })
        },
        SEP24_FAILED: {
          actions: assign({
            error: ({ event }) => event.error
          }),
          target: "Failed"
        },
        SEP24_STARTED: {
          actions: assign({
            sep10Account: ({ event }) => event.output.sep10Account,
            token: ({ event }) => event.output.token,
            tomlValues: ({ event }) => event.output.tomlValues
          })
        },
        SummaryConfirm: {
          actions: ({ context }) => {
            if (context.redirectUrl) {
              window.open(context.redirectUrl, "_blank");
            }
          },
          guard: ({ context }) => !!context.redirectUrl,
          target: "Sep24Second"
        },
        URL_UPDATED: {
          actions: assign({
            id: ({ event }) => event.id,
            redirectUrl: ({ event }) => event.url
          })
        }
      }
    }
  }
});
