import { FC, useCallback } from 'react';
import { useEventsContext } from '../../contexts/events';
import { useFeeComparisonStore } from '../../stores/feeComparison';
import { useRampSummaryVisible } from '../../stores/offrampStore';
import { useValidateTerms } from '../../stores/termsStore';
import { useRampSubmission } from '../../hooks/ramp/useRampSubmission';
import { useQuoteService } from '../../hooks/ramp/useQuoteService';
import { useRampValidation } from '../../hooks/ramp/useRampValidation';
import { SwapSubmitButton } from '../buttons/SwapSubmitButton';

enum SwapButtonState {
  CONFIRMING = 'Confirming',
  PROCESSING = 'Processing',
  CONFIRM = 'Confirm',
}

export const RampSubmitButtons: FC = () => {
  const { feeComparisonRef } = useFeeComparisonStore();
  const { trackEvent } = useEventsContext();
  const validateTerms = useValidateTerms();
  const { onSwapConfirm } = useRampSubmission();
  const { outputAmount: toAmount } = useQuoteService();
  const { getCurrentErrorMessage, initializeFailedMessage } = useRampValidation();
  const isOfframpSummaryDialogVisible = useRampSummaryVisible();

  const handleCompareFeesClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setTimeout(() => {
        feeComparisonRef?.current?.scrollIntoView({ behavior: 'smooth' });
      }, 200);

      trackEvent({
        event: 'compare_quote',
      });
    },
    [feeComparisonRef, trackEvent],
  );

  const getButtonState = (): SwapButtonState => {
    if (isOfframpSummaryDialogVisible) {
      return SwapButtonState.PROCESSING;
    }
    return SwapButtonState.CONFIRM;
  };

  const isSubmitButtonDisabled = Boolean(getCurrentErrorMessage()) || !toAmount || !!initializeFailedMessage;
  const isSubmitButtonPending = isOfframpSummaryDialogVisible;

  return (
    <div className="flex gap-3 mt-5">
      <button
        className="btn-vortex-primary-inverse btn"
        style={{ flex: '1 1 calc(50% - 0.75rem/2)' }}
        onClick={handleCompareFeesClick}
      >
        Compare fees
      </button>
      <SwapSubmitButton text={getButtonState()} disabled={isSubmitButtonDisabled} pending={isSubmitButtonPending} />
    </div>
  );
};
