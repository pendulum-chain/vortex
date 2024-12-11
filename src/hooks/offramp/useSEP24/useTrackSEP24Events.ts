import Big from 'big.js';

import { createTransactionEvent, useEventsContext } from '../../../contexts/events';
import { calculateTotalReceive } from '../../../components/FeeCollapse';
import { OfframpingState } from '../../../services/offrampingFlow';
import { Networks } from '../../../contexts/network';
import {
  getInputTokenDetailsOrDefault,
  OUTPUT_TOKEN_CONFIG,
  InputTokenType,
  OutputTokenType,
} from '../../../constants/tokenConfig';

interface ExecutionInput {
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  amountInUnits: string;
  offrampAmount: Big;
}

export const useTrackSEP24Events = () => {
  const { trackEvent } = useEventsContext();

  const trackKYCStarted = (executionInput: ExecutionInput, selectedNetwork: Networks) => {
    trackEvent({
      event: 'kyc_started',
      from_asset: getInputTokenDetailsOrDefault(selectedNetwork, executionInput.inputTokenType).assetSymbol,
      to_asset: OUTPUT_TOKEN_CONFIG[executionInput.outputTokenType].stellarAsset.code.string,
      from_amount: executionInput.amountInUnits,
      to_amount: calculateTotalReceive(
        executionInput.offrampAmount,
        OUTPUT_TOKEN_CONFIG[executionInput.outputTokenType],
      ),
    });
  };

  const trackKYCCompleted = (initialState: OfframpingState, selectedNetwork: Networks) => {
    trackEvent(createTransactionEvent('kyc_completed', initialState, selectedNetwork));
  };

  return { trackKYCStarted, trackKYCCompleted };
};
