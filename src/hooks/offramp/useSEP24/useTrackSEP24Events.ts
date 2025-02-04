import { createTransactionEvent, useEventsContext } from '../../../contexts/events';
import { OfframpingState } from '../../../services/offrampingFlow';
import { Networks } from '../../../helpers/networks';
import {
  getInputTokenDetailsOrDefault,
  getOutputTokenDetails,
  OUTPUT_TOKEN_CONFIG,
} from '../../../constants/tokenConfig';

import { ExecutionInput } from '../useMainProcess';

export const useTrackSEP24Events = () => {
  const { trackEvent } = useEventsContext();

  const trackKYCStarted = (executionInput: ExecutionInput, selectedNetwork: Networks) => {
    trackEvent({
      event: 'kyc_started',
      from_asset: getInputTokenDetailsOrDefault(selectedNetwork, executionInput.inputTokenType).assetSymbol,
      to_asset: getOutputTokenDetails(executionInput.outputTokenType).stellarAsset.code.string,
      from_amount: executionInput.inputAmountUnits,
      to_amount: executionInput.outputAmountUnits.afterFees,
    });
  };

  const trackKYCCompleted = (initialState: OfframpingState, selectedNetwork: Networks) => {
    trackEvent(createTransactionEvent('kyc_completed', initialState, selectedNetwork));
  };

  return { trackKYCStarted, trackKYCCompleted };
};
