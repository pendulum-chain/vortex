import { useSelector } from "@xstate/react";
import { ReactNode, useCallback } from "react";
import { useRampActor } from "../../contexts/rampState";

export const useRampNavigation = (
  successComponent: ReactNode,
  failureComponent: ReactNode,
  progressComponent: ReactNode,
  formComponent: ReactNode
) => {
  const rampActor = useRampActor();
  const { rampState, rampMachineState, callbackUrl } = useSelector(rampActor, state => ({
    callbackUrl: state.context.callbackUrl,
    rampMachineState: state,
    rampState: state.context.rampState
  }));

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

    return formComponent;
  }, [rampState, formComponent, successComponent, failureComponent, progressComponent, rampMachineState.value, callbackUrl]);

  return {
    currentPhase: rampState?.ramp?.currentPhase,
    getCurrentComponent,
    transactionId: rampState?.ramp?.id
  };
};
