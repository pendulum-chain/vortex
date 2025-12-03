import { getAnyFiatTokenDetails, getOnChainTokenDetailsOrDefault, Networks } from "@vortexfi/shared";
import { createTransactionEvent, useEventsContext } from "../../../contexts/events";
import { RampExecutionInput, RampState } from "../../../types/phases";

export const useTrackSEP24Events = () => {
  const { trackEvent } = useEventsContext();

  const trackKYCStarted = (executionInput: RampExecutionInput, selectedNetwork: Networks) => {
    trackEvent({
      event: "kyc_started",
      from_amount: executionInput.quote.inputAmount,
      from_asset: getOnChainTokenDetailsOrDefault(selectedNetwork, executionInput.onChainToken).assetSymbol,
      to_amount: executionInput.quote.outputAmount,
      to_asset: getAnyFiatTokenDetails(executionInput.fiatToken).fiat.symbol
    });
  };

  const trackKYCCompleted = (initialState: RampState) => {
    trackEvent(createTransactionEvent("kyc_completed", initialState));
  };

  return { trackKYCCompleted, trackKYCStarted };
};
