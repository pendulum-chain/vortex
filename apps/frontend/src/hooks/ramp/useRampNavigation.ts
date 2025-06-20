import { ReactNode, useCallback } from "react";
import { useRampStarted, useRampState } from "../../stores/rampStore";

export const useRampNavigation = (
  successComponent: ReactNode,
  failureComponent: ReactNode,
  progressComponent: ReactNode,
  formComponent: ReactNode
) => {
  const rampState = useRampState();
  const rampStarted = useRampStarted();

  const getCurrentComponent = useCallback(() => {
    if (rampState?.ramp?.currentPhase === "complete") {
      return successComponent;
    }

    if (rampState?.ramp?.currentPhase === "failed") {
      return failureComponent;
    }

    if (rampState !== undefined && rampState.ramp?.currentPhase) {
      if (rampStarted) {
        return progressComponent;
      }
    }

    return formComponent;
  }, [rampState, formComponent, successComponent, failureComponent, rampStarted, progressComponent]);

  return {
    currentPhase: rampState?.ramp?.currentPhase,
    getCurrentComponent,
    transactionId: rampState?.ramp?.id
  };
};
