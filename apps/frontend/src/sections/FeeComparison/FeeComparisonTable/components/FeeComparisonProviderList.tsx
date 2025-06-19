import { BundledPriceResult, PriceProvider } from "@packages/shared";
import { FeeProviderRow } from "../../FeeProviderRow";
import { priceProviders } from "../../priceProviders";
import { useFeeComparisonData } from "../hooks/useFeeComparisonData";

interface FeeComparisonProviderListProps {
  sourceAssetSymbol: string;
  targetAssetSymbol: string;
  amount: string;
}

const DEFAULT_PROVIDERS = [...priceProviders];

export function FeeComparisonProviderList({ sourceAssetSymbol, targetAssetSymbol, amount }: FeeComparisonProviderListProps) {
  const { sortedProviders, bestProvider, isLoadingPrices, allPricesResponse } = useFeeComparisonData(
    amount,
    sourceAssetSymbol,
    targetAssetSymbol,
    DEFAULT_PROVIDERS
  );

  return (
    <>
      {sortedProviders.map(provider => {
        const providerResult =
          provider.name !== "vortex" && allPricesResponse
            ? (allPricesResponse as Record<PriceProvider, BundledPriceResult | undefined>)[provider.name as PriceProvider]
            : undefined;

        return (
          <div key={provider.name}>
            <div className="my-4 w-full border-gray-200 border-b" />
            <FeeProviderRow
              amountRaw={amount}
              bestPrice={bestProvider.bestPrice}
              isBestRate={provider.name === bestProvider.bestProvider}
              isLoading={isLoadingPrices && provider.name !== "vortex"}
              provider={provider}
              result={providerResult}
              sourceAssetSymbol={sourceAssetSymbol}
              targetAssetSymbol={targetAssetSymbol}
            />
          </div>
        );
      })}
    </>
  );
}
