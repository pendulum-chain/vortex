import { FiatToken, OnChainToken } from "@vortexfi/shared";
import Big from "big.js";
import { useCallback, useEffect } from "react";
import { useEventsContext } from "../../contexts/events";
import { useNetwork } from "../../contexts/network";
import { useApiKey, usePartnerId } from "../../stores/partnerStore";
import { useQuoteConstraintsValid } from "../../stores/quote/useQuoteFormStore";
import { useQuoteStore } from "../../stores/quote/useQuoteStore";
import { useRampDirection } from "../../stores/rampDirectionStore";

// @TODO: Rethink this hook, because now
// if you want to get a quote - you get outputAmount through useQuoteService
// if you don't want to get a new quote - you get outputAmount through useQuoteStore
// This is not optimal, and introduce too much cognitive load

export const useQuoteService = (inputAmount: string | undefined, onChainToken: OnChainToken, fiatToken: FiatToken) => {
  const { trackEvent } = useEventsContext();
  const { selectedNetwork } = useNetwork();
  const rampType = useRampDirection();
  const partnerId = usePartnerId();
  const apiKey = useApiKey();
  const quoteConstraintsValid = useQuoteConstraintsValid();

  const {
    actions: { fetchQuote },
    outputAmount
  } = useQuoteStore();

  const getQuote = useCallback(async () => {
    // Wait for constraints to be valid before fetching
    if (!quoteConstraintsValid || !inputAmount) return;

    if (partnerId === undefined || apiKey === undefined) {
      // If partnerId is undefined, it's not set yet, so we don't fetch a quote
      return;
    }

    try {
      await fetchQuote({
        apiKey: apiKey === null ? undefined : apiKey, // Handle null case
        fiatToken,
        inputAmount: Big(inputAmount),
        onChainToken,
        partnerId: partnerId === null ? undefined : partnerId, // Handle null case
        rampType,
        selectedNetwork
      });
    } catch (_err) {
      trackEvent({
        error_message: "signer_service_issue",
        event: "initialization_error"
      });
    }
  }, [
    apiKey,
    quoteConstraintsValid,
    inputAmount,
    fetchQuote,
    rampType,
    onChainToken,
    fiatToken,
    selectedNetwork,
    partnerId,
    trackEvent
  ]);

  useEffect(() => {
    getQuote();
  }, [getQuote]);

  return {
    getQuote,
    outputAmount
  };
};
