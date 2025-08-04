import { createActorContext } from "@xstate/react";
import { rampMachine } from "../machines/ramp.machine";

export const RampStateContext = createActorContext(rampMachine);

export const RampStateProvider = RampStateContext.Provider;
export const useRampActor = RampStateContext.useActorRef;
export const useRampStateSelector = RampStateContext.useSelector;
