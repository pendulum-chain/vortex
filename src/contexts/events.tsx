import { createContext } from 'preact';
import { PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'preact/compat';
import { useAccount } from 'wagmi';
import { INPUT_TOKEN_CONFIG, OUTPUT_TOKEN_CONFIG } from '../constants/tokenConfig';
import { OfframpingState } from '../services/offrampingFlow';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer: Record<string, any>[];
  }
}

const UNIQUE_EVENT_TYPES = ['amount_type',
                            'click_details',
                            'click_support' , 
                            'transaction_confirmation' , 
                            'kyc_completed' , 
                            'transaction_success', 
                            'transaction_failure'];

export interface AmountTypeEvent {
  event: `amount_type`;
}

export interface ClickDetailsEvent {
  event: 'click_details';
}

export interface WalletConnectEvent {
  event: 'wallet_connect';
  wallet_action: 'connect' | 'disconnect' | 'change';
}

export interface TransactionEvent {
  event: 'transaction_confirmation' | 'kyc_completed' | 'transaction_success' | 'transaction_failure';
  from_asset: string;
  to_asset: string;
  from_amount: string;
  to_amount: string;
}

export interface ClickSupportEvent {
  event: 'click_support';
  transaction_status: 'success' | 'failure';
}

export type TrackableEvent =
  | AmountTypeEvent
  | ClickDetailsEvent
  | WalletConnectEvent
  | TransactionEvent
  | ClickSupportEvent;

type EventType = TrackableEvent['event'];

type UseEventsContext = ReturnType<typeof useEvents>;
const useEvents = () => {
  const [_, setTrackedEventTypes] = useState<Set<EventType>>(new Set());

  const previousAddress = useRef<`0x${string}` | undefined>(undefined);
  const [userClicked, setUserClicked] = useState(false);
  const { address, status } = useAccount();

  const trackEvent = useCallback(
    (event: TrackableEvent) => {
      setTrackedEventTypes((trackedEventTypes) => {
        if (UNIQUE_EVENT_TYPES.includes(event.event)) {
          if (trackedEventTypes.has(event.event)) {
            return trackedEventTypes;
          } else {
            trackedEventTypes = new Set(trackedEventTypes);
            trackedEventTypes.add(event.event);
          }
        }
        console.log('Push data layer', event);

        window.dataLayer.push(event);

        return trackedEventTypes;
      });
    },
    [setTrackedEventTypes],
  );

  const resetUniqueEvents = useCallback(() => {
    setTrackedEventTypes(new Set());
  }, [setTrackedEventTypes]);


  useEffect(() => {

    const wasConnected = previousAddress.current !== undefined;
    const isConnected = address !== undefined;

    previousAddress.current = address;

    if (!userClicked) {return}
    
    if (!isConnected) {
      trackEvent({ event: 'wallet_connect', wallet_action: 'disconnect' });
    } else {
      trackEvent({ event: 'wallet_connect', wallet_action: wasConnected ? 'change' : 'connect' });
    }
    
    setUserClicked(false); 
    // Important NOT to add userClicked to the dependencies array, otherwise logic will not work.
  }, [address, trackEvent]);  

  const handleUserClickWallet = () => {
    setUserClicked(true);  
  };

  return {
    trackEvent,
    resetUniqueEvents,
    handleUserClickWallet
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

export function createTransactionEvent(type: TransactionEvent['event'], state: OfframpingState) {
  return {
    event: type,
    from_asset: INPUT_TOKEN_CONFIG[state.inputTokenType].assetSymbol,
    to_asset: OUTPUT_TOKEN_CONFIG[state.outputTokenType].stellarAsset.code.string,
    from_amount: state.inputAmount.units,
    to_amount: state.outputAmount.units,
  };
}
