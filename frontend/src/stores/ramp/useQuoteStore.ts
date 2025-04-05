import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import Big from 'big.js';
import { DestinationType, FiatToken, OnChainToken, QuoteEndpoints } from 'shared';

import { QuoteService } from '../../services/api';
import { useEventsContext } from '../../contexts/events';

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

/**
 * Store for managing quote state and operations
 * Handles fetching quotes from the API and storing the results
 */
export const useQuoteStore = create<QuoteState>()(
  devtools(
    (set, get) => ({
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
          // Prepare parameters for quote API
          const rampType = 'off';
          const fromDestination: DestinationType = selectedNetwork;
          const toDestination: DestinationType = to === 'brl' ? 'pix' : to === 'ars' ? 'cbu' : 'sepa';
          const inputAmount = fromAmount.toString();

          // Fetch quote from API
          const quoteResponse = await QuoteService.createQuote(
            rampType,
            fromDestination,
            toDestination,
            inputAmount,
            from,
            to
          );

          // Update state with quote response
          set({ quote: quoteResponse, loading: false });

          // Note: trackEvent should be called from the component or hook that uses this store
          // We can't directly access context in Zustand stores
        } catch (error) {
          console.error('Error fetching quote:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to get quote';

          set({ error: errorMessage, loading: false });

          // Note: trackEvent should be called from the component or hook that uses this store
        }
      },

      reset: () => {
        set({ quote: undefined, loading: false, error: null });
      },
    }),
    { name: 'quote-store' }
  )
);