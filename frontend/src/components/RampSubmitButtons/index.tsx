import { FC, useCallback } from 'react';
import Big from 'big.js';
import { useEventsContext } from '../../contexts/events';
import { useFeeComparisonStore } from '../../stores/feeComparison';
import { useRampSummaryVisible } from '../../stores/offrampStore';
import { useRampValidation } from '../../hooks/ramp/useRampValidation';
import { SwapSubmitButton } from '../buttons/SwapSubmitButton';
import { useFiatToken, useInputAmount, useOnChainToken } from '../../stores/ramp/useRampFormStore';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { RampDirection } from '../RampToggle';

enum SwapButtonState {
  CONFIRMING = 'Confirming',
  PROCESSING = 'Processing',
  CONFIRM = 'Confirm',
}

interface RampSubmitButtonsProps {
  toAmount?: Big;
}

export const RampSubmitButtons: FC<RampSubmitButtonsProps> = ({ toAmount }) => {
  const { feeComparisonRef } = useFeeComparisonStore();
  const { trackEvent } = useEventsContext();
  const { getCurrentErrorMessage, initializeFailedMessage } = useRampValidation();
  const isOfframpSummaryDialogVisible = useRampSummaryVisible();
  const inputAmount = useInputAmount();
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();
  const rampDirection = useRampDirection();

  const handleCompareFeesClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setTimeout(() => {
        feeComparisonRef?.current?.scrollIntoView({ behavior: 'smooth' });
      }, 200);

      trackEvent({
        event: 'compare_quote',
        from_asset: rampDirection === RampDirection.OFFRAMP ? onChainToken : fiatToken,
        to_asset: rampDirection === RampDirection.OFFRAMP ? fiatToken : onChainToken,
        from_amount: inputAmount?.toString() || '0',
        to_amount: toAmount?.toString() || '0',
      });
    },
    [trackEvent, rampDirection, fiatToken, onChainToken, inputAmount, toAmount, feeComparisonRef],
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
