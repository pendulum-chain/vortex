import { EventStatus } from '../../components/GenericEvent';
import { createTransactionEvent } from '../../contexts/events';

import { useCallback, useState } from 'preact/compat';
import { Networks } from '../../contexts/network';
import { useEventsContext } from '../../contexts/events';
import { OfframpingState } from '../../services/offrampingFlow';
import { GenericEvent } from '../../components/GenericEvent';
import { OFFRAMPING_PHASE_SECONDS } from '../../pages/progress';
import { getInputTokenDetailsOrDefault } from '../../constants/tokenConfig';

export const useOfframpingEvents = (selectedNetwork: Networks) => {
  const { trackEvent, resetUniqueEvents } = useEventsContext();
  const [_, setEvents] = useState<GenericEvent[]>([]);

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
