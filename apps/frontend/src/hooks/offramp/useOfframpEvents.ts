import { useCallback } from "react";
import { createTransactionEvent, useEventsContext } from "../../contexts/events";

import { RampState } from "../../types/phases";

export const useOfframpEvents = () => {
  const { trackEvent, resetUniqueEvents } = useEventsContext();

  const trackOfframpingEvent = useCallback(
    (state: RampState | undefined) => {
      if (!state) return;

      if (state.ramp?.currentPhase === "complete") {
        trackEvent(createTransactionEvent("transaction_success", state));
      } else if (state.ramp?.currentPhase === "failed") {
        // FIXME
        // const inputTokenDetails = getPendulumDetails(state.inputTokenType, selectedNetwork);
        // trackEvent({
        //   ...createTransactionEvent('transaction_failure', state, selectedNetwork),
        //   event: 'transaction_failure',
        //   phase_name: state.phase,
        //   phase_index: Object.keys(RAMPING_PHASE_SECONDS).indexOf(state.phase),
        //   from_asset: inputTokenDetails.pendulumAssetSymbol,
        //   error_message: state.failure.message || 'Unknown error',
        // });
      }
    },
    [trackEvent]
  );

  return { resetUniqueEvents, trackEvent, trackOfframpingEvent };
};
