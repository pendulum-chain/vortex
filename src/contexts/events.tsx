import { createContext } from 'preact';
import { PropsWithChildren, useCallback, useContext, useState } from 'preact/compat';

export type TrackingEventType = 'click' | 'impression' | 'view';

declare global {
  interface Window {
    dataLayer: Record<string, any>[];
  }
}

interface EventDefinition {
  name: string;
  label: string;
}
const eventDefinitions: Record<TrackingEventType, EventDefinition> = {
  click: { name: 'click', label: 'Click' },
  impression: { name: 'impression', label: 'Impression' },
  view: { name: 'view', label: 'View' },
};

function trackUniqueEvent(event: TrackingEventType) {
  const { name, label } = eventDefinitions[event];
  window.dataLayer.push({
    event: name,
    label: label,
  });
}

type UseEventsContext = ReturnType<typeof useEvents>;
const useEvents = () => {
  const [triggeredEvents, setTriggeredEvents] = useState<Set<TrackingEventType>>(new Set());

  const trackEvent = useCallback(
    (event: TrackingEventType) => {
      setTriggeredEvents((events) => {
        if (!events.has(event)) {
          trackUniqueEvent(event);
        }

        const newSet = new Set(events);
        newSet.add(event);
        return newSet;
      });
    },
    [setTriggeredEvents],
  );

  return {
    trackEvent,
  };
};

const Context = createContext<UseEventsContext | undefined>(undefined);

export const useEventsContext = () => {
  const contextValue = useContext(Context);
  if (contextValue === undefined) {
    throw new Error('Context must be inside a Provider');
  }

  return contextValue;
};

export function EventsProvider({ children }: PropsWithChildren) {
  const useEventsResult = useEvents();

  return <Context.Provider value={useEventsResult}>{children}</Context.Provider>;
}
