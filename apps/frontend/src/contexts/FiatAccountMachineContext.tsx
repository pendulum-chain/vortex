import { createActorContext } from "@xstate/react";
import { paymentMethodsMachine } from "../machines/paymentMethods.machine";

export const FiatAccountMachineContext = createActorContext(paymentMethodsMachine);

export const useFiatAccountActor = FiatAccountMachineContext.useActorRef;
export const useFiatAccountSelector = FiatAccountMachineContext.useSelector;
