import { RampExecutionInput } from '../types/phases';
import { BrlaService } from './api';
import { RampDirection } from '../components/RampToggle';
import { useToastMessage } from '../helpers/notifications';
import { useRampDirection } from '../stores/rampDirectionStore';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRampActions } from '../stores/rampStore';

function useRampAmountWithinAllowedLimits() {
  const { t } = useTranslation();
  const { showToast, ToastMessage } = useToastMessage();
  const { setRampKycLevel2Started } = useRampActions();
  const rampDirection = useRampDirection();

  return useCallback(
    async (amountUnits: string, taxId: string): Promise<boolean> => {
      try {
        const remainingLimitResponse = await BrlaService.getUserRemainingLimit(taxId);

        const remainingLimitInUnits =
          rampDirection === RampDirection.OFFRAMP
            ? remainingLimitResponse.remainingLimitOfframp
            : remainingLimitResponse.remainingLimitOnramp;

        const amountNum = Number(amountUnits);
        const remainingLimitNum = Number(remainingLimitInUnits);
        
        // TODO do we still need this check, here?
        // if (true) {
        //   return true;
        // } else {
        //   console.log('Ramp amount exceeds the allowed limits');
        //   setRampKycLevel2Started(true);
        //   showToast(
        //     ToastMessage.RAMP_LIMIT_EXCEEDED,
        //     t('toasts.rampLimitExceeded', { remaining: remainingLimitInUnits }),
        //   );
        //   return false;
        // }
        return true;
      } catch (error) {
        console.error('Error fetching remaining limit:', error);
        return false;
      }
    },
    [rampDirection, showToast, t, ToastMessage.RAMP_LIMIT_EXCEEDED],
  );
}

export function usePreRampCheck() {
  const rampWithinLimits = useRampAmountWithinAllowedLimits();

  return useCallback(
    async (executionInput: RampExecutionInput) => {
      // For BRL ramps, check if the user is within the limits
      if (executionInput.fiatToken === 'brl') {
        if (!executionInput.taxId) {
          throw new Error('Tax ID is required for BRL transactions.');
        }

        const isWithinLimits = await rampWithinLimits(
          executionInput.quote.rampType === 'on' ? executionInput.quote.inputAmount : executionInput.quote.outputAmount,
          executionInput.taxId,
        );
        if (!isWithinLimits) {
          throw new Error('Ramp amount exceeds the allowed limits.');
        }
      }
    },
    [rampWithinLimits],
  );
}
