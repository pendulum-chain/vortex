import { assign, setup } from "xstate";
import type { AccountType, CorridorId } from "@/domain/types";

export interface RegisterDetails {
  name: string;
  email: string;
  accountType: AccountType;
}

export interface RegisterResult extends RegisterDetails {
  selectedCorridors: CorridorId[];
}

interface RegisterContext extends RegisterDetails {
  selectedCorridors: CorridorId[];
  onComplete: (result: RegisterResult) => void;
}

interface RegisterInput {
  onComplete: (result: RegisterResult) => void;
}

type RegisterEvent =
  | { type: "SUBMIT_DETAILS"; details: RegisterDetails }
  | { type: "VERIFY_OTP" }
  | { type: "CHANGE_EMAIL" }
  | { type: "SUBMIT_COUNTRIES"; corridors: CorridorId[] };

/**
 * Mirrors the Vortex Widget auth flow as a mock: details + Terms -> send code ->
 * 6-digit OTP -> verify -> choose countries -> create account.
 */
export const registerMachine = setup({
  actions: {
    complete: ({ context, event }) => {
      if (event.type !== "SUBMIT_COUNTRIES") {
        return;
      }
      context.onComplete({
        accountType: context.accountType,
        email: context.email,
        name: context.name,
        selectedCorridors: event.corridors
      });
    },
    storeDetails: assign(({ event }) => {
      if (event.type !== "SUBMIT_DETAILS") {
        return {};
      }
      return { accountType: event.details.accountType, email: event.details.email, name: event.details.name };
    })
  },
  delays: { SEND_DELAY: 700, VERIFY_DELAY: 900 },
  types: {
    context: {} as RegisterContext,
    events: {} as RegisterEvent,
    input: {} as RegisterInput
  }
}).createMachine({
  context: ({ input }) => ({
    accountType: "company",
    email: "",
    name: "",
    onComplete: input.onComplete,
    selectedCorridors: []
  }),
  id: "register",
  initial: "details",
  states: {
    countries: {
      on: { SUBMIT_COUNTRIES: { actions: "complete", target: "done" } }
    },
    details: {
      on: { SUBMIT_DETAILS: { actions: "storeDetails", target: "sendingCode" } }
    },
    done: { type: "final" },
    otp: {
      on: {
        CHANGE_EMAIL: "details",
        VERIFY_OTP: "verifyingCode"
      }
    },
    sendingCode: {
      after: { SEND_DELAY: "otp" }
    },
    verifyingCode: {
      after: { VERIFY_DELAY: "countries" }
    }
  }
});
