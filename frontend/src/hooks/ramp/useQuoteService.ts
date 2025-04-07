import { useCallback, useEffect } from 'react';
import Big from 'big.js';
import { FiatToken, OnChainToken } from 'shared';

import { useEventsContext } from '../../contexts/events';
import { useQuoteStore } from '../../stores/ramp/useQuoteStore';
import { useNetwork } from '../../contexts/network';
import { useVortexAccount } from '../useVortexAccount';

export const useQuoteService = (fromAmount: Big | undefined, from: OnChainToken, to: FiatToken) => {
  const { trackEvent } = useEventsContext();
  const { selectedNetwork } = useNetwork();
  const { address } = useVortexAccount();

  const { quote, loading, error, fetchQuote, reset } = useQuoteStore();

  const getQuote = useCallback(async () => {
    if (!fromAmount || !address) return;

    try {
      await fetchQuote({
        fromAmount,
        from,
        to,
        selectedNetwork,
        address,
      });

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
      trackEvent({
        event: 'initialization_error',
        error_message: 'signer_service_issue',
      });
    }
  }, [fetchQuote, fromAmount, from, to, selectedNetwork, address, quote, trackEvent]);

  useEffect(() => {
    if (!fromAmount || !address) return;

    getQuote();
  }, [fromAmount, from, to, selectedNetwork, address, getQuote]);

  const exchangeRate = quote ? Number(quote.outputAmount) / Number(quote.inputAmount) : 0;

  const outputAmount = quote ? Big(quote.outputAmount) : undefined;

  return {
    quote,
    outputAmount,
    exchangeRate,
    loading,
    error,
    getQuote,
    reset,
  };
};
