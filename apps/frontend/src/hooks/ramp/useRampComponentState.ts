import { useSearch } from "@tanstack/react-router";
import { useSelector } from "@xstate/react";
import { useRampActor } from "../../contexts/rampState";
import { RampSearchParams } from "../../types/searchParams";

export const useRampComponentState = () => {
  const rampActor = useRampActor();
  const searchParams = useSearch({ strict: false }) as RampSearchParams;

  const { rampState, rampMachineState } = useSelector(rampActor, state => ({
    rampMachineState: state,
    rampState: state.context.rampState
  }));

  return {
    rampMachineState,
    rampState,
    searchParams
  };
};
