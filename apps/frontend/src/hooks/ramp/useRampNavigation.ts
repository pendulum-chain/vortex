import { useSelector } from "@xstate/react";
import { ReactNode, useCallback } from "react";
import { useRampActor } from "../../contexts/rampState";
import { useProvidedQuoteId } from "../../stores/ramp/useQuoteStore";

export const useRampNavigation = (
  successComponent: ReactNode,
  failureComponent: ReactNode,
  progressComponent: ReactNode,
  formComponent: ReactNode,
  widgetComponent: ReactNode
) => {
  const rampActor = useRampActor();
  const { rampState, rampMachineState } = useSelector(rampActor, state => ({
    rampMachineState: state,
    rampState: state.context.rampState
  }));
  const providedQuoteId = useProvidedQuoteId();

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

    if (providedQuoteId) {
      return widgetComponent;
    }

    return formComponent;
  }, [rampState, formComponent, successComponent, failureComponent, progressComponent, providedQuoteId, widgetComponent]);

  return {
    currentPhase: rampState?.ramp?.currentPhase,
    getCurrentComponent,
    transactionId: rampState?.ramp?.id
  };
};
