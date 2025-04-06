import { create } from 'zustand';
import Big from 'big.js';
import { DestinationType, FiatToken, OnChainToken, QuoteEndpoints } from 'shared';

import { QuoteService } from '../../services/api';

interface QuoteParams {
  fromAmount: Big | undefined;
  from: OnChainToken;
  to: FiatToken;
  selectedNetwork: DestinationType;
  address: string | undefined;
}

interface QuoteState {
  quote: QuoteEndpoints.QuoteResponse | undefined;
  loading: boolean;
  error: string | null;

  fetchQuote: (params: QuoteParams) => Promise<void>;
  reset: () => void;
}

export const useQuoteStore = create<QuoteState>((set) => ({
  quote: undefined,
  loading: false,
  error: null,

  fetchQuote: async (params: QuoteParams) => {
    const { fromAmount, from, to, selectedNetwork, address } = params;

    // Validate input parameters
    if (!fromAmount || !address) {
      set({ error: 'Invalid input parameters', loading: false });
      return;
    }

    set({ loading: true, error: null });

    try {
      const rampType = 'off';
      const fromDestination: DestinationType = selectedNetwork;
      const toDestination: DestinationType = to === 'brl' ? 'pix' : to === 'ars' ? 'cbu' : 'sepa';
      const inputAmount = fromAmount.toString();

      const quoteResponse = await QuoteService.createQuote(
        rampType,
        fromDestination,
        toDestination,
        inputAmount,
        from,
        to,
      );

      set({ quote: quoteResponse, loading: false });

      // Note: trackEvent should be called from the component or hook that uses this store
      // We can't directly access context in Zustand stores
    } catch (error) {
      console.error('Error fetching quote:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to get quote';

      set({ error: errorMessage, loading: false });
    }
  },

  reset: () => {
    set({ quote: undefined, loading: false, error: null });
  },
}));
