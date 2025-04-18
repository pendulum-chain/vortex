import { useCallback, useEffect } from 'react';
import Big from 'big.js';
import { FiatToken, OnChainToken } from 'shared';

import { useEventsContext } from '../../contexts/events';
import { useQuoteStore } from '../../stores/ramp/useQuoteStore';
import { useNetwork } from '../../contexts/network';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { RampDirection } from '../../components/RampToggle';

// @TODO: Rethink this hook, because now
// if you want to get a quote - you get outputAmount through useQuoteService
// if you don't want to get a new quote - you get outputAmount through useQuoteStore
// This is not optimal, and introduce too much cognitive load

export const useQuoteService = (inputAmount: string | undefined, onChainToken: OnChainToken, fiatToken: FiatToken) => {
  const { trackEvent } = useEventsContext();
  const { selectedNetwork } = useNetwork();
  const rampDirection = useRampDirection();
  const rampType = rampDirection === RampDirection.ONRAMP ? 'on' : 'off';

  const { quote, fetchQuote, outputAmount } = useQuoteStore();

  const getQuote = useCallback(async () => {
    if (!inputAmount) return;

    try {
      await fetchQuote({
        rampType,
        inputAmount: Big(inputAmount),
        onChainToken,
        fiatToken,
        selectedNetwork,
      });
    } catch (err) {
      trackEvent({
        event: 'initialization_error',
        error_message: 'signer_service_issue',
      });
    }
  }, [inputAmount, fetchQuote, rampType, onChainToken, fiatToken, selectedNetwork, trackEvent]);

  useEffect(() => {
    if (quote && inputAmount) {
      trackEvent({
        event: 'transaction_confirmation',
        from_asset: onChainToken,
        to_asset: fiatToken,
        from_amount: inputAmount,
        to_amount: quote.outputAmount,
      });
    }
  }, [quote, trackEvent, inputAmount, onChainToken, fiatToken]);

  useEffect(() => {
    getQuote();
  }, [getQuote]);

  return {
    outputAmount,
    getQuote,
  };
};
