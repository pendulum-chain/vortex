import { useCallback } from 'react';
import { createTransactionEvent } from '../../contexts/events';
import { useEventsContext } from '../../contexts/events';
import { useNetwork } from '../../contexts/network';

import { RampingState } from '../../types/phases';

export const useOfframpEvents = () => {
  const { trackEvent, resetUniqueEvents } = useEventsContext();
  const { selectedNetwork } = useNetwork();

  const trackOfframpingEvent = useCallback(
    (state: RampingState | undefined) => {
      if (!state) return;

      if (state.phase === 'success') {
        trackEvent(createTransactionEvent('transaction_success', state, selectedNetwork));
      } else if (state.failure) {
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
