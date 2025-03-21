import { createTransactionEvent, useEventsContext } from '../../../contexts/events';
import { OfframpingState } from '../../../services/offrampingFlow';
import { Networks } from '../../../helpers/networks';
import { getOnChainTokenDetailsOrDefault, getBaseFiatTokenDetails } from '../../../constants/tokenConfig';
import { OfframpExecutionInput } from '../../../types/offramp';

export const useTrackSEP24Events = () => {
  const { trackEvent } = useEventsContext();

  const trackKYCStarted = (executionInput: OfframpExecutionInput, selectedNetwork: Networks) => {
    trackEvent({
      event: 'kyc_started',
      from_asset: getOnChainTokenDetailsOrDefault(selectedNetwork, executionInput.OnChainToken).assetSymbol,
      to_asset: getBaseFiatTokenDetails(executionInput.FiatToken).fiat.symbol,
      from_amount: executionInput.inputAmountUnits,
      to_amount: executionInput.outputAmountUnits.afterFees,
    });
  };

  const trackKYCCompleted = (initialState: OfframpingState, selectedNetwork: Networks) => {
    trackEvent(createTransactionEvent('kyc_completed', initialState, selectedNetwork));
  };

  return { trackKYCStarted, trackKYCCompleted };
};
