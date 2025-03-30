import { useCallback } from 'react';
import { createTransactionEvent } from '../../contexts/events';
import { useEventsContext } from '../../contexts/events';
import { useNetwork } from '../../contexts/network';

import { RampState } from '../../types/phases';

export const useOfframpEvents = () => {
  const { trackEvent, resetUniqueEvents } = useEventsContext();
  const { selectedNetwork } = useNetwork();

  const trackOfframpingEvent = useCallback(
    (state: RampState | undefined) => {
      if (!state) return;

      if (state.ramp?.currentPhase === 'complete') {
        trackEvent(createTransactionEvent('transaction_success', state, selectedNetwork));
      } else if (state.ramp?.currentPhase === 'failed') {
        // FIXME
        // const inputTokenDetails = getPendulumDetails(state.inputTokenType, selectedNetwork);
        // trackEvent({
        //   ...createTransactionEvent('transaction_failure', state, selectedNetwork),
        //   event: 'transaction_failure',
        //   phase_name: state.phase,
        //   phase_index: Object.keys(OFFRAMPING_PHASE_SECONDS).indexOf(state.phase),
        //   from_asset: inputTokenDetails.pendulumAssetSymbol,
        //   error_message: state.failure.message || 'Unknown error',
        // });
      }
    },
    [trackEvent, selectedNetwork],
  );

  return { trackOfframpingEvent, trackEvent, resetUniqueEvents };
};
