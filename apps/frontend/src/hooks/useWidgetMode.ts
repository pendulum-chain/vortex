import { useSelector } from "@xstate/react";
import { useMemo } from "react";
import { useRampActor } from "../contexts/rampState";

export const useWidgetMode = (): boolean => {
  const rampActor = useRampActor();
  const state = useSelector(rampActor, state => state.value);

  const isWidgetMode = useMemo(() => {
    // We are in widget mode if the ramp state is not 'Idle'
    return state !== "Idle";
  }, [state]);

  return isWidgetMode;
};
