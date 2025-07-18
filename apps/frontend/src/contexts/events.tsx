import { FiatToken, getNetworkId, isNetworkEVM, PriceProvider } from "@packages/shared";
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef } from "react";
import { LocalStorageKeys } from "../hooks/useLocalStorage";
import { useVortexAccount } from "../hooks/useVortexAccount";
import { storageService } from "../services/storage/local";
import { useInputAmount } from "../stores/ramp/useRampFormStore";
import { RampState } from "../types/phases";
import { useNetwork } from "./network";

declare global {
  interface Window {
    dataLayer: TrackableEvent[];
  }
}

const UNIQUE_EVENT_TYPES: TrackableEvent["event"][] = [
  "click_details",
  "click_support",
  "transaction_confirmation",
  "kyc_started",
  "kyc_completed",
  "signing_requested",
  "transaction_signed",
  "transaction_success",
  "transaction_failure",
  "email_submission"
];

export interface AmountTypeEvent {
  event: "amount_type";
  input_amount: string;
}

export interface ClickDetailsEvent {
  event: "click_details";
}

export interface WalletConnectEvent {
  event: "wallet_connect";
  wallet_action: "connect" | "disconnect" | "change";
  input_amount?: string;
  account_address?: string;
  network_selected?: string;
}

export interface RampParameters {
  from_asset: string;
  to_asset: string;
  from_amount: string;
  to_amount: string;
}

export type TransactionEvent = RampParameters & {
  event: "transaction_confirmation" | "kyc_started" | "kyc_completed" | "transaction_success" | "transaction_failure";
};

export type TransactionFailedEvent = RampParameters & {
  event: "transaction_failure";
  phase_name: string;
  phase_index: number;
  error_message: string;
};

export type CompareQuoteEvent = RampParameters & {
  event: "compare_quote";
  moonpay_quote?: string;
  alchemypay_quote?: string;
  transak_quote?: string;
};

export interface ProgressEvent {
  event: "progress";
  phase_name: string;
  phase_index: number;
}

export interface SigningRequestedEvent {
  event: "signing_requested";
  index: number;
}

export interface TransactionSignedEvent {
  event: "transaction_signed";
  index: number;
}

export interface EmailSubmissionEvent {
  event: "email_submission";
  transaction_status: "success" | "failure";
}

export interface ClickSupportEvent {
  event: "click_support";
  transaction_status: "success" | "failure";
}

export interface NetworkChangeEvent {
  event: "network_change";
  from_network: number;
  to_network: number;
}

export interface FormErrorEvent {
  event: "form_error";
  input_amount: string;
  error_message:
    | "insufficient_balance"
    | "insufficient_liquidity"
    | "less_than_minimum_withdrawal"
    | "more_than_maximum_withdrawal";
}

export interface InitializationErrorEvent {
  event: "initialization_error";
  error_message: InitializationErrorMessage;
}

export interface TokenUnavailableErrorEvent {
  event: "token_unavailable";
  token: FiatToken;
}

type InitializationErrorMessage =
  | "node_connection_issue"
  | "signer_service_issue"
  | "moonbeam_account_issue"
  | "stellar_account_issue"
  | "pendulum_account_issue";

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
  | InitializationErrorEvent
  | TokenUnavailableErrorEvent;

type EventType = TrackableEvent["event"];

type UseEventsContext = ReturnType<typeof useEvents>;

const useEvents = () => {
  const { address } = useVortexAccount();
  const previousChainId = useRef<number | undefined>(undefined);
  const firstRender = useRef(true);
  const { selectedNetwork } = useNetwork();
  const inputAmount = useInputAmount();

  const scheduledPrices = useRef<
    | {
        parameters: RampParameters;
        prices: Partial<Record<PriceProvider, string>>;
      }
    | undefined
  >(undefined);

  const trackedEventTypes = useRef<Set<EventType>>(new Set());
  const firedFormErrors = useRef<Set<FormErrorEvent["error_message"]>>(new Set());

  const trackEvent = useCallback((event: TrackableEvent) => {
    if (UNIQUE_EVENT_TYPES.includes(event.event)) {
      if (trackedEventTypes.current.has(event.event)) {
        return;
      } else {
        trackedEventTypes.current.add(event.event);
      }
    }

    if (event.event === "initialization_error") {
      const eventsStored = storageService.getParsed<Set<InitializationErrorMessage>>(
        LocalStorageKeys.FIRED_INITIALIZATION_EVENTS
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
    if (event.event === "form_error") {
      const { error_message } = event;
      if (firedFormErrors.current.has(error_message)) {
        return;
      } else {
        // Add error message to fired form errors
        firedFormErrors.current.add(error_message);
      }
    }

    console.log("Push data layer", event);

    window.dataLayer.push(event);
  }, []);

  const resetUniqueEvents = useCallback(() => {
    trackedEventTypes.current = new Set();
  }, []);

  /// This function is used to schedule a quote returned by a quote service. Once all quotes are ready, it emits a compare_quote event.
  /// Calling this function with a quote of '-1' will make the function emit the quote as undefined.
  const schedulePrice = useCallback(
    (service: PriceProvider | "vortex", price: string, parameters: RampParameters, enableEventTracking: boolean) => {
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
          alchemypay_quote: newPrices.alchemypay !== "-1" ? newPrices.alchemypay : undefined,
          event: "compare_quote",
          moonpay_quote: newPrices.moonpay !== "-1" ? newPrices.moonpay : undefined,
          transak_quote: newPrices.transak !== "-1" ? newPrices.transak : undefined
        });
        // Reset the prices
        scheduledPrices.current = undefined;
      } else {
        scheduledPrices.current = {
          parameters,
          prices: newPrices
        };
      }
    },
    [trackEvent]
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
      event: "network_change",
      from_network: previousChainId.current,
      to_network: chainId
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

    const networkId = getNetworkId(selectedNetwork);

    if (!isConnected && wasConnected) {
      trackEvent({
        account_address: previous,
        event: "wallet_connect",
        input_amount: inputAmount ? inputAmount.toString() : "0",
        network_selected: networkId.toString(),
        wallet_action: "disconnect"
      });
    } else if (wasChanged && networkId) {
      trackEvent({
        account_address: address,
        event: "wallet_connect",
        input_amount: inputAmount ? inputAmount.toString() : "0",
        network_selected: networkId.toString(),
        wallet_action: wasConnected ? "change" : "connect"
      });
    }

    if (address) {
      storageService.set(storageKey, address);
    } else {
      storageService.remove(storageKey);
    }
  }, [inputAmount, selectedNetwork, address, trackEvent]);

  return {
    resetUniqueEvents,
    schedulePrice,
    trackEvent
  };
};
const Context = createContext<UseEventsContext | undefined>(undefined);

export const useEventsContext = () => {
  const contextValue = useContext(Context);
  if (contextValue === undefined) {
    throw new Error("Context must be inside a Provider");
  }

  return contextValue;
};

export function EventsProvider({ children }: PropsWithChildren) {
  const useEventsResult = useEvents();

  return <Context.Provider value={useEventsResult}>{children}</Context.Provider>;
}

export function createTransactionEvent(type: TransactionEvent["event"], state: RampState) {
  return {
    event: type,
    from_amount: state.quote.inputAmount,
    from_asset: state.quote.inputCurrency,
    to_amount: state.quote.outputAmount,
    to_asset: state.quote.outputCurrency
  };
}

export function clearPersistentErrorEventStore() {
  storageService.remove(LocalStorageKeys.FIRED_INITIALIZATION_EVENTS);
}
