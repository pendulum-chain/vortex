import { BundledPriceResult, PriceProvider } from '@packages/shared';
import { FeeProviderRow } from '../../FeeProviderRow';
import { priceProviders } from '../../priceProviders';
import { useFeeComparisonData } from '../hooks/useFeeComparisonData';

interface FeeComparisonProviderListProps {
  sourceAssetSymbol: string;
  targetAssetSymbol: string;
  amount: string;
}

const DEFAULT_PROVIDERS = [...priceProviders];

export function FeeComparisonProviderList({
  sourceAssetSymbol,
  targetAssetSymbol,
  amount,
}: FeeComparisonProviderListProps) {
  const { sortedProviders, bestProvider, isLoadingPrices, allPricesResponse } = useFeeComparisonData(
    amount,
    sourceAssetSymbol,
    targetAssetSymbol,
    DEFAULT_PROVIDERS,
  );

  return (
    <>
      {sortedProviders.map((provider) => {
        const providerResult =
          provider.name !== 'vortex' && allPricesResponse
            ? (allPricesResponse[provider.name as PriceProvider] as BundledPriceResult | undefined)
            : undefined;

        return (
          <div key={provider.name}>
            <div className="w-full my-4 border-b border-gray-200" />
            <FeeProviderRow
              provider={provider}
              result={providerResult}
              isLoading={isLoadingPrices && provider.name !== 'vortex'}
              isBestRate={provider.name === bestProvider.bestProvider}
              bestPrice={bestProvider.bestPrice}
              amountRaw={amount}
              sourceAssetSymbol={sourceAssetSymbol}
              targetAssetSymbol={targetAssetSymbol}
            />
          </div>
        );
      })}
    </>
  );
}
