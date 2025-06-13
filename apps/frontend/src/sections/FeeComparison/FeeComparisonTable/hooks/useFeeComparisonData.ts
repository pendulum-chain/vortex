import { BundledPriceResult, Currency } from '@packages/shared';
import { useQuery } from '@tanstack/react-query';
import Big from 'big.js';
import { useMemo } from 'react';

import { activeOptions, cacheKeys } from '../../../../constants/cache';
import { useNetwork } from '../../../../contexts/network';
import { PriceService } from '../../../../services/api';
import { useQuote } from '../../../../stores/ramp/useQuoteStore';
import { useRampDirection } from '../../../../stores/rampDirectionStore';
import { PriceProviderDetails } from '../../priceProviders';

/**
 * Custom hook to fetch and process fee comparison data
 * @param amount Amount to convert
 * @param sourceAssetSymbol Source asset symbol
 * @param targetAssetSymbol Target asset symbol
 * @param providers List of price providers
 * @returns Processed fee comparison data
 */
export function useFeeComparisonData(
  amount: string,
  sourceAssetSymbol: string,
  targetAssetSymbol: string,
  providers: PriceProviderDetails[],
) {
  const rampDirection = useRampDirection();
  const { selectedNetwork } = useNetwork();

  const quote = useQuote();

  const vortexPrice = useMemo(() => (quote ? Big(quote.outputAmount) : Big(0)), [quote]);

  // Fetch prices from all providers
  const { data: allPricesResponse, isLoading: isLoadingPrices } = useQuery({
    queryKey: [cacheKeys.allPrices, amount, sourceAssetSymbol, targetAssetSymbol, selectedNetwork, rampDirection],
    queryFn: () => {
      const direction = rampDirection === 'onramp' ? 'onramp' : 'offramp';
      return PriceService.getAllPricesBundled(
        sourceAssetSymbol.toLowerCase() as Currency,
        targetAssetSymbol.toLowerCase() as Currency,
        amount,
        direction,
        selectedNetwork,
      );
    },
    ...activeOptions['1m'],
  });

  // Process provider prices
  const providerPrices = useMemo(() => {
    const prices: Record<string, Big> = {};

    prices['vortex'] = vortexPrice;

    if (allPricesResponse) {
      Object.entries(allPricesResponse).forEach(([provider, result]) => {
        const typedResult = result as BundledPriceResult | undefined;
        if (typedResult?.status === 'fulfilled' && typedResult.value.quoteAmount) {
          // Use quoteAmount which represents what the user will receive
          prices[provider] = Big(typedResult.value.quoteAmount.toString());
        }
      });
    }

    console.log('providerPrices:', prices);

    return prices;
  }, [allPricesResponse, vortexPrice]);

  const bestProvider = useMemo(() => {
    return Object.entries(providerPrices).reduce(
      (best, [provider, price]) => {
        return price.gt(best.bestPrice) ? { bestPrice: price, bestProvider: provider } : best;
      },
      { bestPrice: new Big(0), bestProvider: '' },
    );
  }, [providerPrices]);

  // Sort providers by price
  const sortedProviders = useMemo(() => {
    return [...providers].sort((a, b) => {
      const aPrice = providerPrices[a.name] ?? Big(0);
      const bPrice = providerPrices[b.name] ?? Big(0);
      return bPrice.minus(aPrice).toNumber();
    });
  }, [providerPrices, providers]);

  return {
    providerPrices,
    bestProvider,
    sortedProviders,
    isLoadingPrices,
    allPricesResponse,
  };
}
