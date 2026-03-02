import { assign, setup } from "xstate";
import { type PaymentMethodKey } from "../constants/alfredPayMethods";

export interface PaymentMethodsContext {
  selectedMethod: PaymentMethodKey | undefined;
}

export const paymentMethodsMachine = setup({
  types: {
    context: {} as PaymentMethodsContext,
    events: {} as
      | { type: "ADD_NEW" }
      | { type: "SELECT_METHOD"; method: PaymentMethodKey }
      | { type: "REGISTER_DONE" }
      | { type: "GO_BACK" }
  }
}).createMachine({
  context: {
    selectedMethod: undefined
  },
  id: "paymentMethods",
  initial: "AccountsList",
  states: {
    AccountsList: {
      on: {
        ADD_NEW: { target: "PickMethod" }
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
});
