import { createTransactionEvent, useEventsContext } from '../../../contexts/events';
import { Networks } from 'shared';
import { getOnChainTokenDetailsOrDefault, getAnyFiatTokenDetails } from 'shared';
import { RampExecutionInput, RampState } from '../../../types/phases';

export const useTrackSEP24Events = () => {
  const { trackEvent } = useEventsContext();

  const trackKYCStarted = (executionInput: RampExecutionInput, selectedNetwork: Networks) => {
    trackEvent({
      event: 'kyc_started',
      from_asset: getOnChainTokenDetailsOrDefault(selectedNetwork, executionInput.onChainToken).assetSymbol,
      to_asset: getAnyFiatTokenDetails(executionInput.fiatToken).fiat.symbol,
      from_amount: executionInput.quote.inputAmount,
      to_amount: executionInput.quote.outputAmount
    });
  };

  const trackKYCCompleted = (initialState: RampState, selectedNetwork: Networks) => {
    trackEvent(createTransactionEvent('kyc_completed', initialState, selectedNetwork));
  };

  return { trackKYCStarted, trackKYCCompleted };
};
