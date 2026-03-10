import { assign, setup } from "xstate";
import { type PaymentMethodKey } from "../constants/alfredPayMethods";

export interface PaymentMethodsContext {
  selectedMethod: PaymentMethodKey | undefined;
  selectedFiatAccountId: string | null;
  fiatRegistrationCountry: string | null;
}

export const paymentMethodsMachine = setup({
  types: {
    context: {} as PaymentMethodsContext,
    events: {} as
      | { type: "OPEN"; country: string }
      | { type: "ADD_NEW" }
      | { type: "SELECT_METHOD"; method: PaymentMethodKey }
      | { type: "REGISTER_DONE" }
      | { type: "GO_BACK" }
      | { type: "SELECT_ACCOUNT"; id: string }
  }
}).createMachine({
  context: {
    fiatRegistrationCountry: null,
    selectedFiatAccountId: null,
    selectedMethod: undefined
  },
  id: "paymentMethods",
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
            ADD_NEW: { target: "PickMethod" },
            GO_BACK: { target: "#paymentMethods.Closed" }
          }
        },
        PickMethod: {
          on: {
            GO_BACK: { target: "AccountsList" },
            SELECT_METHOD: {
              actions: assign({ selectedMethod: ({ event }) => event.method }),
              target: "RegisterAccount"
            }
          }
        },
        RegisterAccount: {
          on: {
            GO_BACK: { target: "PickMethod" },
            REGISTER_DONE: {
              actions: assign({ selectedMethod: undefined }),
              target: "AccountsList"
            }
          }
        }
      }
    }
  }
});
