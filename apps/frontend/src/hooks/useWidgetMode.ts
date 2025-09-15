import { useSelector } from "@xstate/react";
import { useMemo } from "react";
import { useRampActor } from "../contexts/rampState";

export const useWidgetMode = (): boolean => {
  const rampActor = useRampActor();
  const state = useSelector(rampActor, state => state.value);

  // const isWidgetMode = useMemo(() => {
  //   // We are in widget mode if the ramp state is not 'Idle', and we're not on the /widget route
  //   const isWidgetRoute = window.location.pathname.includes("/widget");
  //   return state !== "Idle" && !isWidgetRoute;
  // }, [state]);
  const isWidgetMode = useMemo(() => window.location.pathname.includes("/widget"), []);

  return isWidgetMode;
};
