import { useCallback } from 'react';
import { ReactNode } from 'react';
import { useRampState, useRampKycStarted } from '../../stores/offrampStore';

/**
 * Hook for handling ramp navigation
 * Determines which component should be displayed based on the current ramp state
 */
export const useRampNavigation = (
  successComponent: ReactNode,
  failureComponent: ReactNode,
  progressComponent: ReactNode,
  formComponent: ReactNode
) => {
  const rampState = useRampState();
  const offrampKycStarted = useRampKycStarted();

  /**
   * Determines the current component to display based on ramp state
   */
  const getCurrentComponent = useCallback(() => {
    // Show success page if ramp process is complete
    if (rampState?.ramp?.currentPhase === 'complete') {
      return successComponent;
    }

    // Show error page if ramp process failed
    if (rampState?.ramp?.currentPhase === 'failed') {
      return failureComponent;
    }

    // Show progress page if ramp process is in progress
    if (rampState !== undefined && rampState.ramp?.currentPhase) {
      // Check if we're in an executing state (any phase that's not initial, complete, or failed)
      const isExecuting = rampState.ramp.currentPhase !== 'initial' &&
                         rampState.ramp.currentPhase !== 'complete' &&
                         rampState.ramp.currentPhase !== 'failed';

      if (isExecuting) {
        return progressComponent;
      }
    }

    // Default to form component
    return formComponent;
  }, [rampState, successComponent, failureComponent, progressComponent, formComponent]);

  /**
   * Determines if we should show the KYC form based on ramp state
   */
  const shouldShowKycForm = useCallback(() => {
    return offrampKycStarted;
  }, [offrampKycStarted]);

  /**
   * Gets the transaction ID if available
   */
  const getTransactionId = useCallback(() => {
    // This assumes the transaction ID is stored somewhere in the ramp state
    // Adjust according to the actual data structure
    return rampState?.sep24Response?.id;
  }, [rampState]);

  return {
    getCurrentComponent,
    shouldShowKycForm,
    transactionId: getTransactionId(),
    currentPhase: rampState?.ramp?.currentPhase,
  };
};