import { useCallback } from 'react';
import { ReactNode } from 'react';
import { useRampState, useRampKycStarted } from '../../stores/offrampStore';

export const useRampNavigation = (
  successComponent: ReactNode,
  failureComponent: ReactNode,
  progressComponent: ReactNode,
  formComponent: ReactNode,
) => {
  const rampState = useRampState();
  const offrampKycStarted = useRampKycStarted();

  const getCurrentComponent = useCallback(() => {
    if (rampState?.ramp?.currentPhase === 'complete') {
      return successComponent;
    }

    if (rampState?.ramp?.currentPhase === 'failed') {
      return failureComponent;
    }

    if (rampState !== undefined && rampState.ramp?.currentPhase) {
      const isExecuting = rampState.ramp.currentPhase !== 'initial'; // complete and failed are already handled above

      if (isExecuting) {
        return progressComponent;
      }
    }

    return formComponent;
  }, [rampState, successComponent, failureComponent, progressComponent, formComponent]);

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
