import { createTransactionEvent, useEventsContext } from '../../../contexts/events';
import { Networks } from 'shared';
import { getOnChainTokenDetailsOrDefault, getAnyFiatTokenDetails } from 'shared';
import { RampExecutionInput, RampingState } from '../../../types/phases';

export const useTrackSEP24Events = () => {
  const { trackEvent } = useEventsContext();

  const trackKYCStarted = (executionInput: RampExecutionInput, selectedNetwork: Networks) => {
    trackEvent({
      event: 'kyc_started',
      from_asset: getOnChainTokenDetailsOrDefault(selectedNetwork, executionInput.onChainToken).assetSymbol,
      to_asset: getAnyFiatTokenDetails(executionInput.fiatToken).fiat.symbol,
      from_amount: executionInput.inputAmountUnits,
      to_amount: executionInput.outputAmountUnits.afterFees,
    });
  };

  const trackKYCCompleted = (initialState: RampingState, selectedNetwork: Networks) => {
    trackEvent(createTransactionEvent('kyc_completed', initialState, selectedNetwork));
  };

  return { trackKYCStarted, trackKYCCompleted };
};
