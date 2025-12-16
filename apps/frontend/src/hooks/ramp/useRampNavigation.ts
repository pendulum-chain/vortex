import { ReactNode, useCallback } from "react";
import { useRampComponentState } from "./useRampComponentState";

export const useRampNavigation = (
  successComponent: ReactNode,
  failureComponent: ReactNode,
  progressComponent: ReactNode,
  formComponent: ReactNode,
  quoteComponent: ReactNode
) => {
  const { searchParams, rampState, rampMachineState } = useRampComponentState();

  const getCurrentComponent = useCallback(() => {
    if (searchParams.quoteId) {
      return formComponent;
    }

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
