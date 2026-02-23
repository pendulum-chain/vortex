import { ReactNode, useCallback } from "react";
import { useIsQuoteComponentDisplayed } from "./useIsQuoteComponentDisplayed";
import { useRampComponentState } from "./useRampComponentState";

export const useRampNavigation = (
  successComponent: ReactNode,
  failureComponent: ReactNode,
  progressComponent: ReactNode,
  formComponent: ReactNode,
  quoteComponent: ReactNode
) => {
  const { rampState, rampMachineState } = useRampComponentState();
  const isQuoteDisplayed = useIsQuoteComponentDisplayed();

  const getCurrentComponent = useCallback(() => {
    if (rampState?.ramp?.currentPhase === "complete") {
      return successComponent;
    }

    if (rampState?.ramp?.currentPhase === "failed") {
      return failureComponent;
    }

    if (rampState !== undefined && rampMachineState.value === "RampFollowUp") {
      return progressComponent;
    }

    if (isQuoteDisplayed) {
      return quoteComponent;
    }

    return formComponent;
  }, [
    rampState,
    rampMachineState.value,
    successComponent,
    failureComponent,
    progressComponent,
    formComponent,
    quoteComponent,
    isQuoteDisplayed
  ]);

  return {
    currentPhase: rampState?.ramp?.currentPhase,
    getCurrentComponent,
    transactionId: rampState?.ramp?.id
  };
};
