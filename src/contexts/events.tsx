import { createContext } from 'preact';
import { PropsWithChildren, useCallback, useContext, useEffect, useRef } from 'preact/compat';
import Big from 'big.js';
import * as Sentry from '@sentry/react';
import { useAccount } from 'wagmi';
import { getInputTokenDetails, OUTPUT_TOKEN_CONFIG } from '../constants/tokenConfig';
import { OfframpingState } from '../services/offrampingFlow';
import { calculateTotalReceive } from '../components/FeeCollapse';
import { QuoteService } from '../services/quotes';
import { Networks } from './network';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer: Record<string, any>[];
  }
}

const UNIQUE_EVENT_TYPES: TrackableEvent['event'][] = [
  'amount_type',
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
  event: `amount_type`;
}

export interface ClickDetailsEvent {
  event: 'click_details';
}

export interface WalletConnectEvent {
  event: 'wallet_connect';
  wallet_action: 'connect' | 'disconnect' | 'change';
  account_address?: string;
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
  error_message:
    | 'insufficient_balance'
    | 'insufficient_liquidity'
    | 'less_than_minimum_withdrawal'
    | 'more_than_maximum_withdrawal';
}

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
  | NetworkChangeEvent;

type EventType = TrackableEvent['event'];

type UseEventsContext = ReturnType<typeof useEvents>;

const useEvents = () => {
  const { address, chainId } = useAccount();
  const previousAddress = useRef<`0x${string}` | undefined>(undefined);
  const previousChainId = useRef<number | undefined>(undefined);
  const userClickedState = useRef<boolean>(false);

  const scheduledQuotes = useRef<
    | {
        parameters: OfframpingParameters;
        quotes: Partial<Record<QuoteService, string>>;
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
  const scheduleQuote = useCallback(
    (service: QuoteService, quote: string, parameters: OfframpingParameters) => {
      const prev = scheduledQuotes.current;

      // Do a deep comparison of the parameters to check if they are the same.
      // If they are not, reset the quotes.
      const newQuotes =
        prev && JSON.stringify(prev.parameters) !== JSON.stringify(parameters)
          ? { [service]: quote }
          : { ...prev?.quotes, [service]: quote };

      // If all quotes are ready, emit the event
      if (Object.keys(newQuotes).length === 3) {
        trackEvent({
          ...parameters,
          event: 'compare_quote',
          transak_quote: newQuotes.transak !== '-1' ? newQuotes.transak : undefined,
          moonpay_quote: newQuotes.moonpay !== '-1' ? newQuotes.moonpay : undefined,
          alchemypay_quote: newQuotes.alchemypay !== '-1' ? newQuotes.alchemypay : undefined,
        });
        // Reset the quotes
        scheduledQuotes.current = undefined;
      } else {
        scheduledQuotes.current = {
          parameters,
          quotes: newQuotes,
        };
      }
    },
    [trackEvent],
  );

  useEffect(() => {
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
  }, [chainId, trackEvent]);

  useEffect(() => {
    const wasConnected = previousAddress.current !== undefined;
    const isConnected = address !== undefined;

    // set sentry user as wallet address
    if (address) {
      Sentry.setUser({ id: address });

      previousAddress.current = address;
    }

    if (!userClickedState.current) {
      return;
    }

    if (!isConnected) {
      trackEvent({
        event: 'wallet_connect',
        wallet_action: 'disconnect',
        account_address: previousAddress.current,
      });
    } else {
      trackEvent({
        event: 'wallet_connect',
        wallet_action: wasConnected ? 'change' : 'connect',
        account_address: address,
      });
    }

    previousAddress.current = address;
    userClickedState.current = false;
    // Important NOT to add userClicked to the dependencies array, otherwise logic will not work.
  }, [address, trackEvent, userClickedState]);

  const handleUserClickWallet = () => {
    userClickedState.current = true;
  };

  return {
    trackEvent,
    resetUniqueEvents,
    handleUserClickWallet,
    scheduleQuote,
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
  state: OfframpingState,
  selectedNetwork: Networks,
) {
  return {
    event: type,
    from_asset: getInputTokenDetails(selectedNetwork, state.inputTokenType).assetSymbol,
    to_asset: OUTPUT_TOKEN_CONFIG[state.outputTokenType]?.stellarAsset?.code?.string,
    from_amount: state.inputAmount.units,
    to_amount: calculateTotalReceive(Big(state.outputAmount.units), OUTPUT_TOKEN_CONFIG[state.outputTokenType]),
  };
}
