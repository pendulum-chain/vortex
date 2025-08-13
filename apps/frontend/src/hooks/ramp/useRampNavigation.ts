import { ReactNode, useCallback } from "react";
import { useProvidedQuoteId } from "../../stores/ramp/useQuoteStore";
import { useRampStarted, useRampState } from "../../stores/rampStore";

export const useRampNavigation = (
  successComponent: ReactNode,
  failureComponent: ReactNode,
  progressComponent: ReactNode,
  formComponent: ReactNode,
  widgetComponent: ReactNode
) => {
  const rampState = useRampState();
  const rampStarted = useRampStarted();
  const providedQuoteId = useProvidedQuoteId();

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

    if (providedQuoteId) {
      return widgetComponent;
    }

    return formComponent;
  }, [
    rampState,
    formComponent,
    successComponent,
    failureComponent,
    rampStarted,
    progressComponent,
    providedQuoteId,
    widgetComponent
  ]);

  return {
    currentPhase: rampState?.ramp?.currentPhase,
    getCurrentComponent,
    transactionId: rampState?.ramp?.id
  };
};
