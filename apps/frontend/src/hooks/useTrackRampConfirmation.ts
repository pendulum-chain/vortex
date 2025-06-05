import { useCallback } from 'react';
import { useFiatToken, useInputAmount, useOnChainToken } from '../stores/ramp/useRampFormStore';
import { useRampDirection } from '../stores/rampDirectionStore';
import { useQuoteStore } from '../stores/ramp/useQuoteStore';
import { RampDirection } from '../components/RampToggle';
import { useEventsContext } from '../contexts/events';

export const useTrackRampConfirmation = () => {
  const rampDirection = useRampDirection();
  const { trackEvent } = useEventsContext();
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();
  const inputAmount = useInputAmount();
  const { quote } = useQuoteStore();

  return useCallback(() => {
    const fromAsset = rampDirection === RampDirection.ONRAMP ? fiatToken : onChainToken;
    const toAsset = rampDirection === RampDirection.ONRAMP ? onChainToken : fiatToken;
    trackEvent({
      event: 'transaction_confirmation',
      from_asset: fromAsset,
      to_asset: toAsset,
      from_amount: inputAmount?.toString() || '0',
      to_amount: quote?.outputAmount || '0',
    });
  }, [fiatToken, onChainToken, inputAmount, quote, rampDirection, trackEvent]);
};
