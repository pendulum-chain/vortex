import { RampExecutionInput } from '../types/phases';
import { useToastMessage } from '../helpers/notifications';
import { useRampDirection } from '../stores/rampDirectionStore';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { BRLA_MAXIMUM_LEVEL_2_AMOUNT_UNITS } from '../constants/constants';
import Big from 'big.js';

function useRampAmountWithinAllowedLimits() {
  const { t } = useTranslation();
  const { showToast, ToastMessage } = useToastMessage();
  const rampDirection = useRampDirection();

  return useCallback(
    async (amountUnits: string): Promise<boolean> => {
      try {
        const amountBigNumber = Big(amountUnits);
        if (amountBigNumber.lte(Big(BRLA_MAXIMUM_LEVEL_2_AMOUNT_UNITS))) {
          return false;
        }
        
        return true;
      } catch (error) {
        console.error('useRampAmountWithinAllowedLimits: Error checking ramp limits: ', error);
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
          executionInput.quote.rampType === 'on' ? executionInput.quote.inputAmount : executionInput.quote.outputAmount
        );
        if (!isWithinLimits) {
          throw new Error('Ramp amount exceeds the allowed limits.');
        }
      }
    },
    [rampWithinLimits],
  );
}
