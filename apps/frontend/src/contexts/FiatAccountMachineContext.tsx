import { createActorContext } from "@xstate/react";
import { fiatAccountMachine } from "../machines/fiatAccount.machine";

export const FiatAccountMachineContext = createActorContext(fiatAccountMachine);

export const useFiatAccountActor = FiatAccountMachineContext.useActorRef;
export const useFiatAccountSelector = FiatAccountMachineContext.useSelector;
