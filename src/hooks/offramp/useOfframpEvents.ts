import { useCallback, useState } from 'preact/compat';

import { EventStatus } from '../../components/GenericEvent';
import { GenericEvent } from '../../components/GenericEvent';

import { createTransactionEvent } from '../../contexts/events';
import { useEventsContext } from '../../contexts/events';
import { useNetwork } from '../../contexts/network';

import { getInputTokenDetailsOrDefault } from '../../constants/tokenConfig';
import { OfframpingState } from '../../services/offrampingFlow';
import { OFFRAMPING_PHASE_SECONDS } from '../../pages/progress';

export const useOfframpEvents = () => {
  const { trackEvent, resetUniqueEvents } = useEventsContext();
  const { selectedNetwork } = useNetwork();
  const [_, setEvents] = useState<GenericEvent[]>([]);

  // @todo: why do we need this?
  const addEvent = (message: string, status: EventStatus) => {
    setEvents((prevEvents) => [...prevEvents, { value: message, status }]);
  };

  const trackOfframpingEvent = useCallback(
    (state: OfframpingState | undefined) => {
      if (!state) return;

      if (state.phase === 'success') {
        trackEvent(createTransactionEvent('transaction_success', state, selectedNetwork));
      } else if (state.failure) {
        trackEvent({
          ...createTransactionEvent('transaction_failure', state, selectedNetwork),
          event: 'transaction_failure',
          phase_name: state.phase,
          phase_index: Object.keys(OFFRAMPING_PHASE_SECONDS).indexOf(state.phase),
          from_asset: getInputTokenDetailsOrDefault(selectedNetwork, state.inputTokenType).assetSymbol,
          error_message: state.failure.message,
        });
      }
    },
    [trackEvent, selectedNetwork],
  );

  return { addEvent, trackOfframpingEvent, trackEvent, resetUniqueEvents };
};
