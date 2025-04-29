import { useMemo } from 'react';
import Big from 'big.js';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { getAnyFiatTokenDetails, getNetworkDisplayName, getOnChainTokenDetailsOrDefault, isNetworkEVM, PriceEndpoints } from 'shared';
import { FeeProviderRow } from '../FeeProviderRow';
import { useNetwork } from '../../../contexts/network';
import { priceProviders } from '../priceProviders';
import { useRampFormStore } from '../../../stores/ramp/useRampFormStore';
import { useRampDirection } from '../../../stores/rampDirectionStore';
import { RampDirection } from '../../../components/RampToggle';
import { PriceService } from '../../../services/api';
import { cacheKeys, activeOptions } from '../../../constants/cache';
import { useQuote } from '../../../stores/ramp/useQuoteStore';

const DEFAULT_PROVIDERS = [...priceProviders];

export function FeeComparisonTable() {
  const { t } = useTranslation();
  const { inputAmount, onChainToken, fiatToken } = useRampFormStore();
  const { selectedNetwork } = useNetwork();
  const quote = useQuote();

  const rampDirection = useRampDirection();
  const isOnramp = rampDirection === RampDirection.ONRAMP;
  const onChainTokenDetails = getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken);
  const fiatTokenDetails = getAnyFiatTokenDetails(fiatToken);
  const sourceAssetSymbol = isOnramp ? fiatTokenDetails.fiat.symbol : onChainTokenDetails.assetSymbol;
  const targetAssetSymbol = isOnramp ? onChainTokenDetails.assetSymbol : fiatTokenDetails.fiat.symbol;

  const amount = inputAmount || '100';
  
  // Get the vortex price from the quote
  const vortexPrice = useMemo(() => (quote ? Big(quote.outputAmount) : Big(0)), [quote]);

  // Fetch all prices in a single request
  const { data: allPricesResponse, isLoading: isLoadingPrices } = useQuery({
    queryKey: [
      cacheKeys.allPrices,
      amount,
      sourceAssetSymbol,
      targetAssetSymbol,
      selectedNetwork
    ],
    queryFn: () => PriceService.getAllPricesBundled(
      sourceAssetSymbol.toLowerCase() as PriceEndpoints.CryptoCurrency,
      targetAssetSymbol.toLowerCase() as PriceEndpoints.FiatCurrency,
      amount,
      selectedNetwork
    ),
    ...activeOptions['1m'],
    enabled: !isOnramp, // Only fetch for offramp for now
  });

  // Calculate provider prices from the bundled response
  const providerPrices = useMemo(() => {
    const prices: Record<string, Big> = {};
    
    // Add vortex price from the quote
    prices['vortex'] = vortexPrice;
    
    if (allPricesResponse) {
      Object.entries(allPricesResponse).forEach(([provider, result]) => {
        const typedResult = result as PriceEndpoints.BundledPriceResult | undefined;
        if (typedResult?.status === 'fulfilled' && typedResult.value.fiatAmount) {
          prices[provider] = Big(typedResult.value.fiatAmount);
        }
      });
    }
    
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

  const sortedProviders = useMemo(() => {
    return [...DEFAULT_PROVIDERS].sort((a, b) => {
      const aPrice = providerPrices[a.name] ?? Big(0);
      const bPrice = providerPrices[b.name] ?? Big(0);
      return bPrice.minus(aPrice).toNumber();
    });
  }, [providerPrices]);

  const networkDisplay = !isNetworkEVM(selectedNetwork) ? (
    <div
      className="tooltip tooltip-primary before:whitespace-pre-wrap before:content-[attr(data-tip)]"
      data-tip={t('sections.feeComparison.table.tooltip', { network: getNetworkDisplayName(selectedNetwork) })}
    >
      <span translate="no">(Polygon)</span>
    </div>
  ) : null;

  return (
    <div className="p-4 transition-all pb-8 duration-300 bg-white rounded-2xl shadow-custom hover:scale-[101%]">
      <div className="flex items-center justify-center w-full mb-3">
        <div className="flex items-center justify-center w-full gap-4">
          <span className="font-bold text-md">
            {t('sections.feeComparison.table.sending')} {Number(amount).toFixed(2)} {sourceAssetSymbol} {networkDisplay}{' '}
            {t('sections.feeComparison.table.with')}
          </span>
        </div>
        <div className="flex flex-col items-center justify-center w-full">
          <span className="font-bold text-md">{t('sections.feeComparison.table.recipientGets')}</span>
          <span className="text-sm">{t('sections.feeComparison.table.totalAfterFees')}</span>
        </div>
      </div>

      {sortedProviders.map((provider) => {
        // Get the result for this specific provider
        const providerResult = provider.name !== 'vortex' && allPricesResponse
          ? allPricesResponse[provider.name as PriceEndpoints.Provider] as PriceEndpoints.BundledPriceResult | undefined
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
    </div>
  );
}
