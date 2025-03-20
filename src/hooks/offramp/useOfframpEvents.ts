import { useCallback } from 'react';
import { createTransactionEvent } from '../../contexts/events';
import { useEventsContext } from '../../contexts/events';
import { useNetwork } from '../../contexts/network';

import { getPendulumDetails } from '../../constants/tokenConfig';
import { OfframpingState } from '../../services/offrampingFlow';
import { OFFRAMPING_PHASE_SECONDS } from '../../pages/progress';
import { BrlaOnrampingState } from '../../services/onrampingFlow';

export const useOfframpEvents = () => {
  const { trackEvent, resetUniqueEvents } = useEventsContext();
  const { selectedNetwork } = useNetwork();

  const trackOfframpingEvent = useCallback(
    (state: OfframpingState | BrlaOnrampingState | undefined) => {
      if (!state) return;

      if (state.phase === 'success') {
        trackEvent(createTransactionEvent('transaction_success', state, selectedNetwork));
      } else if (state.failure) {
        const inputTokenDetails = getPendulumDetails(state.network, state.inputTokenType);
        trackEvent({
          ...createTransactionEvent('transaction_failure', state, selectedNetwork),
          event: 'transaction_failure',
          phase_name: state.phase,
          phase_index: Object.keys(OFFRAMPING_PHASE_SECONDS).indexOf(state.phase),
          from_asset: inputTokenDetails.pendulumAssetSymbol,
          error_message: state.failure.message || 'Unknown error',
        });
      }
    },
    [trackEvent, selectedNetwork],
  );

  return { trackOfframpingEvent, trackEvent, resetUniqueEvents };
};
