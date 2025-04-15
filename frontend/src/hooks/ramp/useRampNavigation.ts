import { useCallback } from 'react';
import { ReactNode } from 'react';
import { useRampState, useRampKycStarted, useRampStarted } from '../../stores/rampStore';

export const useRampNavigation = (
  successComponent: ReactNode,
  failureComponent: ReactNode,
  progressComponent: ReactNode,
  formComponent: ReactNode,
) => {
  const rampState = useRampState();
  const rampStarted = useRampStarted();
  const offrampKycStarted = useRampKycStarted();

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

  const shouldShowKycForm = useCallback(() => {
    return offrampKycStarted;
  }, [offrampKycStarted]);

  const getTransactionId = useCallback(() => {
    return rampState?.ramp?.id;
  }, [rampState]);

  return {
    getCurrentComponent,
    shouldShowKycForm,
    transactionId: getTransactionId(),
    currentPhase: rampState?.ramp?.currentPhase,
  };
};
