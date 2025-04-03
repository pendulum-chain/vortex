import { useCallback } from 'react';
import { useSubmitOfframp } from '../../offramp/useSubmitOfframp';
import { useOfframpActions, useOfframpExecutionInput } from '../../../stores/offrampStore';
import { performSwapInitialChecks } from '../../../pages/swap/helpers/performSwapInitialChecks';

export const useOfframpSubmission = (handleError: (message?: string) => Promise<void>) => {
  const offrampInput = useOfframpExecutionInput();
  const submitOfframp = useSubmitOfframp();

  return useCallback(() => {
    if (!offrampInput) {
      return handleError('No execution input found for KYC process');
    }

    performSwapInitialChecks()
      .then(() => {
        console.info('Initial checks completed after KYC. Starting process..');
        submitOfframp(offrampInput);
      })
      .catch((error) => {
        console.error('Error during swap confirmation after KYC', { error });
        offrampInput?.setInitializeFailed();
        handleError('Error during swap confirmation after KYC');
      });
  }, [offrampInput, handleError, submitOfframp]);
};
