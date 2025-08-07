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
      | { type: "SEP24_FAILED"; error: any },
    input: {} as RampContext,
    output: {} as PaymentData | { status: "Failed"; msg: string; error?: any }
  }
}).createMachine({
  context: ({ input }) => ({
    ...input,
    redirectUrl: undefined
  }),
  id: "stellarKyc",
  initial: "StartSep24",
  states: {
    Done: {
      output: ({ context }) => context.paymentData,
      type: "final"
    },
    Failed: {
      output: ({ context }) => ({
        error: context.error,
        msg: "KYC process failed.",
        status: "Failed"
      }),
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
          actions: assign({
            paymentData: ({ event }) => event.output
          })
        },
        onError: {
          actions: assign({
            error: ({ event }) => event.error
          }),
          target: "Failed"
        },
        src: "sep24Second"
      },
      onDone: {
        actions: ({ context }) => {
          console.log("context after output: ", context);
        },
        target: "Done"
      }
    },
    StartSep24: {
      invoke: {
        id: "startSep24Actor",
        input: ({ context }) => context,
        src: "startSep24"
      },
      on: {
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
