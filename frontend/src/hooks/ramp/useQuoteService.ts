import { useCallback, useEffect } from 'react';
import Big from 'big.js';
import { DestinationType, FiatToken, OnChainToken } from 'shared';

import { useEventsContext } from '../../contexts/events';
import { useQuoteStore } from '../../stores/ramp/useQuoteStore';
import { useNetwork } from '../../contexts/network';
import { useVortexAccount } from '../useVortexAccount';

/**
 * Hook for handling quote-related operations
 * Encapsulates the logic for fetching quotes and tracking events
 */
export const useQuoteService = (
  fromAmount: Big | undefined,
  from: OnChainToken,
  to: FiatToken
) => {
  const { trackEvent } = useEventsContext();
  const { selectedNetwork } = useNetwork();
  const { address } = useVortexAccount();

  // Get store methods and state
  const { quote, loading, error, fetchQuote, reset } = useQuoteStore();

  // Exposed method to get a quote
  const getQuote = useCallback(async () => {
    if (!fromAmount || !address) return;

    try {
      await fetchQuote({
        fromAmount,
        from,
        to,
        selectedNetwork,
        address
      });

      // Track successful quote fetch
      if (quote) {
        trackEvent({
          event: 'transaction_confirmation',
          from_asset: from,
          to_asset: to,
          from_amount: fromAmount.toString(),
          to_amount: quote.outputAmount,
        });
      }
    } catch (err) {
      // Track error event
      trackEvent({
        event: 'initialization_error',
        error_message: 'signer_service_issue',
      });
    }
  }, [fetchQuote, fromAmount, from, to, selectedNetwork, address, quote, trackEvent]);

  // Fetch quote when dependencies change
  useEffect(() => {
    if (!fromAmount || !address) return;

    getQuote();
  }, [fromAmount, from, to, selectedNetwork, address, getQuote]);

  // Calculate exchange rate from quote
  const exchangeRate = quote ? Number(quote.outputAmount) / Number(quote.inputAmount) : 0;

  // Calculate output amount as Big.js object for components
  const outputAmount = quote ? Big(quote.outputAmount) : undefined;

  return {
    quote,
    outputAmount,
    exchangeRate,
    loading,
    error,
    getQuote,
    reset
  };
};