import { useSearch } from "@tanstack/react-router";
import { useSelector } from "@xstate/react";
import { ReactNode, useCallback } from "react";
import { useRampActor } from "../../contexts/rampState";
import { RampSearchParams } from "../../types/searchParams";

export const useRampNavigation = (
  successComponent: ReactNode,
  failureComponent: ReactNode,
  progressComponent: ReactNode,
  formComponent: ReactNode,
  quoteComponent: ReactNode
) => {
  const rampActor = useRampActor();
  const searchParams = useSearch({ strict: false }) as RampSearchParams;

  const { rampState, rampMachineState } = useSelector(rampActor, state => ({
    rampMachineState: state,
    rampState: state.context.rampState
  }));

  const getCurrentComponent = useCallback(() => {
    // Priority 1: If quoteId exists in URL, always show the widget/form
    if (searchParams.quoteId) {
      return formComponent;
    }

    // Priority 2-5: Existing logic
    if (rampState?.ramp?.currentPhase === "complete") {
      return successComponent;
    }

    if (rampState?.ramp?.currentPhase === "failed") {
      return failureComponent;
    }

    if (rampState !== undefined && rampMachineState.value === "RampFollowUp") {
      return progressComponent;
    }

    if (rampState !== undefined && rampMachineState.value === "Idle") {
      return formComponent;
    }

    return quoteComponent;
  }, [
    searchParams.quoteId,
    rampState,
    formComponent,
    successComponent,
    failureComponent,
    progressComponent,
    rampMachineState.value,
    quoteComponent
  ]);

  return {
    currentPhase: rampState?.ramp?.currentPhase,
    getCurrentComponent,
    transactionId: rampState?.ramp?.id
  };
};
