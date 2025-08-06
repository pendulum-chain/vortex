import { PaymentData } from "@packages/shared";
import { assign, sendParent, setup } from "xstate";
import { ISep24Intermediate } from "../types/sep";
import { sep24SecondActor } from "./actors/stellar/sep24Second.actor";
import { startSep24Actor } from "./actors/stellar/startSep24.actor";
import { RampContext } from "./types";

export const stellarKycMachine = setup({
  actors: {
    sep24Second: sep24SecondActor,
    startSep24: startSep24Actor
  },
  types: {
    context: {} as RampContext & {
      token?: string;
      sep10Account?: any;
      paymentData?: PaymentData;
      redirectUrl?: string;
      tomlValues?: any;
      id?: string;
      error?: any;
    },
    events: {} as
      | { type: "Cancel" }
      | { type: "SummaryConfirm2" }
      | { type: "URL_UPDATED"; url: string; id: string }
      | {
          type: "SEP24_STARTED";
          output: { token: string; sep10Account: any; tomlValues: any };
        }
      | { type: "SEP24_FAILED"; error: any },
    input: {} as RampContext,
    output: {} as
      | PaymentData
      | { status: "Failed"; msg: string; error?: any }
      | { status: "Cancelled"; msg: string; error?: any }
  }
}).createMachine({
  context: ({ input }) => ({
    ...input,
    redirectUrl: undefined
  }),
  id: "stellarKyc",
  initial: "StartSep24",
  // At any point in the KYC process, the user can cancel it.
  on: {
    Cancel: ".Cancelled"
  },
  states: {
    Cancelled: {
      output: { msg: "User cancelled.", status: "Cancelled" },
      type: "final"
    },
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
          }),
          target: "Done"
        },
        onError: {
          actions: assign({
            error: ({ event }) => event.error
          }),
          target: "Failed"
        },
        src: "sep24Second"
      }
    },
    StartSep24: {
      invoke: {
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
        SummaryConfirm2: {
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
