import { createContext } from 'react';
import { PropsWithChildren, useCallback, useContext, useEffect, useRef } from 'react';
import Big from 'big.js';
import { getPendulumDetails, PriceEndpoints } from 'shared';
import { calculateTotalReceive } from '../components/FeeCollapse';
import { useVortexAccount } from '../hooks/useVortexAccount';
import { getNetworkId, isNetworkEVM, Networks } from 'shared';
import { LocalStorageKeys } from '../hooks/useLocalStorage';
import { storageService } from '../services/storage/local';
import { useNetwork } from './network';
import { useFromAmount } from '../stores/formStore';
import { RampingState } from '../types/phases';

declare global {
  interface Window {
    dataLayer: TrackableEvent[];
  }
}

const UNIQUE_EVENT_TYPES: TrackableEvent['event'][] = [
  'click_details',
  'click_support',
  'transaction_confirmation',
  'kyc_started',
  'kyc_completed',
  'signing_requested',
  'transaction_signed',
  'transaction_success',
  'transaction_failure',
  'email_submission',
];

export interface AmountTypeEvent {
  event: 'amount_type';
  input_amount: string;
}

export interface ClickDetailsEvent {
  event: 'click_details';
}

export interface WalletConnectEvent {
  event: 'wallet_connect';
  wallet_action: 'connect' | 'disconnect' | 'change';
  input_amount?: string;
  account_address?: string;
  network_selected?: string;
}

export interface OfframpingParameters {
  from_asset: string;
  to_asset: string;
  from_amount: string;
  to_amount: string;
}

export type TransactionEvent = OfframpingParameters & {
  event: 'transaction_confirmation' | 'kyc_started' | 'kyc_completed' | 'transaction_success' | 'transaction_failure';
};

export type TransactionFailedEvent = OfframpingParameters & {
  event: 'transaction_failure';
  phase_name: string;
  phase_index: number;
  error_message: string;
};

export type CompareQuoteEvent = OfframpingParameters & {
  event: 'compare_quote';
  moonpay_quote?: string;
  alchemypay_quote?: string;
  transak_quote?: string;
};

export interface ProgressEvent {
  event: 'progress';
  phase_name: string;
  phase_index: number;
}

export interface SigningRequestedEvent {
  event: 'signing_requested';
  index: number;
}

export interface TransactionSignedEvent {
  event: 'transaction_signed';
  index: number;
}

export interface EmailSubmissionEvent {
  event: 'email_submission';
  transaction_status: 'success' | 'failure';
}

export interface ClickSupportEvent {
  event: 'click_support';
  transaction_status: 'success' | 'failure';
}

export interface NetworkChangeEvent {
  event: 'network_change';
  from_network: number;
  to_network: number;
}

export interface FormErrorEvent {
  event: 'form_error';
  input_amount: string;
  error_message:
    | 'insufficient_balance'
    | 'insufficient_liquidity'
    | 'less_than_minimum_withdrawal'
    | 'more_than_maximum_withdrawal';
}

export interface InitializationErrorEvent {
  event: 'initialization_error';
  error_message: InitializationErrorMessage;
}

type InitializationErrorMessage =
  | 'node_connection_issue'
  | 'signer_service_issue'
  | 'moonbeam_account_issue'
  | 'stellar_account_issue'
  | 'pendulum_account_issue';

export type TrackableEvent =
  | AmountTypeEvent
  | ClickDetailsEvent
  | WalletConnectEvent
  | TransactionEvent
  | TransactionFailedEvent
  | CompareQuoteEvent
  | ClickSupportEvent
  | FormErrorEvent
  | EmailSubmissionEvent
  | SigningRequestedEvent
  | TransactionSignedEvent
  | ProgressEvent
  | NetworkChangeEvent
  | InitializationErrorEvent;

type EventType = TrackableEvent['event'];

type UseEventsContext = ReturnType<typeof useEvents>;

const useEvents = () => {
  const { address } = useVortexAccount();
  const previousChainId = useRef<number | undefined>(undefined);
  const firstRender = useRef(true);
  const { selectedNetwork } = useNetwork();
  const fromAmount = useFromAmount();

  const scheduledPrices = useRef<
    | {
        parameters: OfframpingParameters;
        prices: Partial<Record<PriceEndpoints.Provider, string>>;
      }
    | undefined
  >(undefined);

  const trackedEventTypes = useRef<Set<EventType>>(new Set());
  const firedFormErrors = useRef<Set<FormErrorEvent['error_message']>>(new Set());

  const trackEvent = useCallback((event: TrackableEvent) => {
    if (UNIQUE_EVENT_TYPES.includes(event.event)) {
      if (trackedEventTypes.current.has(event.event)) {
        return;
      } else {
        trackedEventTypes.current.add(event.event);
      }
    }

    if (event.event === 'initialization_error') {
      const eventsStored = storageService.getParsed<Set<InitializationErrorMessage>>(
        LocalStorageKeys.FIRED_INITIALIZATION_EVENTS,
      );
      const eventsSet = eventsStored ? new Set(eventsStored) : new Set();
      if (eventsSet.has(event.error_message)) {
        return;
      } else {
        eventsSet.add(event.error_message);
        storageService.set(LocalStorageKeys.FIRED_INITIALIZATION_EVENTS, Array.from(eventsSet));
      }
    }

    // Check if form error message has already been fired as we only want to fire each error message once
    if (event.event === 'form_error') {
      const { error_message } = event;
      if (firedFormErrors.current.has(error_message)) {
        return;
      } else {
        // Add error message to fired form errors
        firedFormErrors.current.add(error_message);
      }
    }

    console.log('Push data layer', event);

    window.dataLayer.push(event);
  }, []);

  const resetUniqueEvents = useCallback(() => {
    trackedEventTypes.current = new Set();
  }, []);

  /// This function is used to schedule a quote returned by a quote service. Once all quotes are ready, it emits a compare_quote event.
  /// Calling this function with a quote of '-1' will make the function emit the quote as undefined.
  const schedulePrice = useCallback(
    (
      service: PriceEndpoints.Provider | 'vortex',
      price: string,
      parameters: OfframpingParameters,
      enableEventTracking: boolean,
    ) => {
      if (!enableEventTracking) return;

      const prev = scheduledPrices.current;

      // Do a deep comparison of the parameters to check if they are the same.
      // If they are not, reset the quotes.
      const newPrices =
        prev && JSON.stringify(prev.parameters) !== JSON.stringify(parameters)
          ? { [service]: price }
          : { ...prev?.prices, [service]: price };

      // If all quotes are ready, emit the event
      if (Object.keys(newPrices).length === 3) {
        trackEvent({
          ...parameters,
          event: 'compare_quote',
          transak_quote: newPrices.transak !== '-1' ? newPrices.transak : undefined,
          moonpay_quote: newPrices.moonpay !== '-1' ? newPrices.moonpay : undefined,
          alchemypay_quote: newPrices.alchemypay !== '-1' ? newPrices.alchemypay : undefined,
        });
        // Reset the prices
        scheduledPrices.current = undefined;
      } else {
        scheduledPrices.current = {
          parameters,
          prices: newPrices,
        };
      }
    },
    [trackEvent],
  );

  useEffect(() => {
    const chainId = getNetworkId(selectedNetwork);
    if (!chainId) return;

    if (previousChainId.current === undefined) {
      previousChainId.current = chainId;
      // This means we are in the first render, so we don't want to track the event
      return;
    }

    trackEvent({
      event: 'network_change',
      from_network: previousChainId.current,
      to_network: chainId,
    });

    previousChainId.current = chainId;
  }, [selectedNetwork, trackEvent]);

  useEffect(() => {
    // Ignore first update. Address is set to undefined independently of the wallet connection.
    // It immediately refreshes to a value, if connected.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const isEvm = isNetworkEVM(selectedNetwork);
    const storageKey = isEvm ? LocalStorageKeys.TRIGGER_ACCOUNT_EVM : LocalStorageKeys.TRIGGER_ACCOUNT_POLKADOT;

    const previous = storageService.get(storageKey);

    const wasConnected = previous !== undefined;
    const wasChanged = previous !== address;
    const isConnected = address !== undefined;

    if (!isConnected && wasConnected) {
      trackEvent({
        event: 'wallet_connect',
        wallet_action: 'disconnect',
        account_address: previous,
        input_amount: fromAmount ? fromAmount.toString() : '0',
        network_selected: getNetworkId(selectedNetwork).toString(),
      });
    } else if (wasChanged) {
      trackEvent({
        event: 'wallet_connect',
        wallet_action: wasConnected ? 'change' : 'connect',
        account_address: address,
        input_amount: fromAmount ? fromAmount.toString() : '0',
        network_selected: getNetworkId(selectedNetwork).toString(),
      });
    }

    if (address) {
      storageService.set(storageKey, address);
    } else {
      storageService.remove(storageKey);
    }
  }, [fromAmount, selectedNetwork, address, trackEvent]);

  return {
    trackEvent,
    resetUniqueEvents,
    schedulePrice,
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

export function createTransactionEvent(
  type: TransactionEvent['event'],
  state: RampingState,
  selectedNetwork: Networks,
) {
  const onChainTokenDetails = getPendulumDetails(state.onChainToken, selectedNetwork);
  const fiatToken = getPendulumDetails(state.fiatToken, selectedNetwork);
  return {
    event: type,
    from_asset: onChainTokenDetails.pendulumAssetSymbol ?? 'unknown',
    to_asset: fiatToken.pendulumAssetSymbol,
    from_amount: state.inputAmount.units,
    to_amount: calculateTotalReceive(state.type, Big(state.outputAmount.units), state.fiatToken),
  };
}

export function clearPersistentErrorEventStore() {
  storageService.remove(LocalStorageKeys.FIRED_INITIALIZATION_EVENTS);
}
