import { useCallback } from 'react';
import { ReactNode } from 'react';
import { useRampState, useRampStarted } from '../../stores/rampStore';

export const useRampNavigation = (
  successComponent: ReactNode,
  failureComponent: ReactNode,
  progressComponent: ReactNode,
  formComponent: ReactNode,
) => {
  const rampState = useRampState();
  const rampStarted = useRampStarted();

  const getCurrentComponent = useCallback(() => {
    if (rampState?.ramp?.currentPhase === 'complete') {
      return successComponent;
    }

    if (rampState?.ramp?.currentPhase === 'failed') {
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
    getCurrentComponent,
    transactionId: rampState?.ramp?.id,
    currentPhase: rampState?.ramp?.currentPhase,
  };
};
