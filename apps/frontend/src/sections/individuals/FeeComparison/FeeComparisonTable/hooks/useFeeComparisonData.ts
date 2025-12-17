import { UseQueryOptions, useQuery } from "@tanstack/react-query";
import { AllPricesResponse, Currency, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { useMemo } from "react";

import { activeOptions, cacheKeys } from "../../../../../constants/cache";
import { PriceService } from "../../../../../services/api";
import { PriceProviderDetails } from "../../priceProviders";

/**
 * Custom hook to fetch and process fee comparison data
 * @param amount Amount to convert
 * @param sourceAssetSymbol Source asset symbol
 * @param targetAssetSymbol Target asset symbol
 * @param providers List of price providers
 * @param direction Ramp direction
 * @param network Network to use
 * @returns Processed fee comparison data
 */
export function useFeeComparisonData(
  amount: string,
  sourceAssetSymbol: string,
  targetAssetSymbol: string,
  providers: PriceProviderDetails[],
  direction: RampDirection,
  network: Networks
) {
  // Fetch prices from all providers (including vortex)
  const { data: allPricesResponse, isLoading: isLoadingPrices } = useQuery<AllPricesResponse, Error>({
    queryFn: () => {
      return PriceService.getAllPricesBundled(
        sourceAssetSymbol.toLowerCase() as Currency,
        targetAssetSymbol.toLowerCase() as Currency,
        amount,
        direction,
        network
      );
    },
    queryKey: [cacheKeys.allPrices, amount, sourceAssetSymbol, targetAssetSymbol, network, direction],
    ...(activeOptions["1m"] as Omit<UseQueryOptions<AllPricesResponse, Error>, "queryKey" | "queryFn">)
  });

  const providerPrices = useMemo(() => {
    const prices: Record<string, Big> = {};

    if (allPricesResponse) {
      Object.entries(allPricesResponse).forEach(([provider, result]) => {
        if (result?.status === "fulfilled" && result.value.quoteAmount) {
          prices[provider] = Big(result.value.quoteAmount.toString());
        }
      });
    }

    return prices;
  }, [allPricesResponse]);

  const bestProvider = useMemo(() => {
    return Object.entries(providerPrices).reduce(
      (best, [provider, price]) => {
        return price.gt(best.bestPrice) ? { bestPrice: price, bestProvider: provider } : best;
      },
      { bestPrice: new Big(0), bestProvider: "" }
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
    allPricesResponse,
    bestProvider,
    isLoadingPrices,
    providerPrices,
    sortedProviders
  };
}
