import { assign, setup } from "xstate";
import { type FiatAccountTypeKey } from "../constants/fiatAccountMethods";

export interface FiatAccountMachineContext {
  selectedAccountType: FiatAccountTypeKey | undefined;
  selectedFiatAccountId: string | null;
  fiatRegistrationCountry: string | null;
}

export const fiatAccountMachine = setup({
  types: {
    context: {} as FiatAccountMachineContext,
    events: {} as
      | { type: "OPEN"; country: string }
      | { type: "ADD_NEW" }
      | { type: "SELECT_ACCOUNT_TYPE"; accountType: FiatAccountTypeKey }
      | { type: "REGISTER_DONE" }
      | { type: "GO_BACK" }
      | { type: "SELECT_ACCOUNT"; id: string }
  }
}).createMachine({
  context: {
    fiatRegistrationCountry: null,
    selectedAccountType: undefined,
    selectedFiatAccountId: null
  },
  id: "fiatAccount",
  initial: "Closed",
  states: {
    Closed: {
      on: {
        OPEN: {
          actions: assign({ fiatRegistrationCountry: ({ event }) => event.country }),
          target: "Open"
        },
        SELECT_ACCOUNT: {
          actions: assign({ selectedFiatAccountId: ({ event }) => event.id })
        }
      }
    },
    Open: {
      initial: "AccountsList",
      on: {
        SELECT_ACCOUNT: {
          actions: assign({ selectedFiatAccountId: ({ event }) => event.id })
        }
      },
      states: {
        AccountsList: {
          on: {
            ADD_NEW: { target: "PickAccountType" },
            GO_BACK: {
              actions: assign({ fiatRegistrationCountry: null, selectedFiatAccountId: null }),
              target: "#fiatAccount.Closed"
            }
          }
        },
        PickAccountType: {
          on: {
            GO_BACK: { target: "AccountsList" },
            SELECT_ACCOUNT_TYPE: {
              actions: assign({ selectedAccountType: ({ event }) => event.accountType }),
              target: "RegisterAccount"
            }
          }
        },
        RegisterAccount: {
          on: {
            GO_BACK: { target: "PickAccountType" },
            REGISTER_DONE: {
              actions: assign({ selectedAccountType: undefined }),
              target: "AccountsList"
            }
          }
        }
      }
    }
  }
});
