import { useCallback, useState, useMemo } from 'react';
import Big from 'big.js';
import { useTranslation } from 'react-i18next';

import { getAnyFiatTokenDetails, getNetworkDisplayName, getOnChainTokenDetailsOrDefault, isNetworkEVM } from 'shared';
import { FeeProviderRow } from '../FeeProviderRow';
import { useNetwork } from '../../../contexts/network';
import { priceProviders } from '../priceProviders';
import { useRampFormStore } from '../../../stores/ramp/useRampFormStore';
import { useRampDirection } from '../../../stores/rampDirectionStore';
import { RampDirection } from '../../../components/RampToggle';

const DEFAULT_PROVIDERS = [...priceProviders];

export function FeeComparisonTable() {
  const { t } = useTranslation();
  const { inputAmount, onChainToken, fiatToken } = useRampFormStore();
  const { selectedNetwork } = useNetwork();

  const rampDirection = useRampDirection();
  const isOnramp = rampDirection === RampDirection.ONRAMP;
  const onChainTokenDetails = getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken);
  const fiatTokenDetails = getAnyFiatTokenDetails(fiatToken);
  const sourceAssetSymbol = isOnramp ? fiatTokenDetails.fiat.symbol : onChainTokenDetails.assetSymbol;
  const targetAssetSymbol = isOnramp ? onChainTokenDetails.assetSymbol : fiatTokenDetails.fiat.symbol;

  const amount = inputAmount || Big(100);

  const [providerPrices, setProviderPrices] = useState<Record<string, Big>>({});

  const handlePriceUpdate = useCallback((providerName: string, price: Big) => {
    setProviderPrices((prev) => ({ ...prev, [providerName]: price }));
  }, []);

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
            {t('sections.feeComparison.table.sending')} {amount.toFixed(2)} {sourceAssetSymbol} {networkDisplay}{' '}
            {t('sections.feeComparison.table.with')}
          </span>
        </div>
        <div className="flex flex-col items-center justify-center w-full">
          <span className="font-bold text-md">{t('sections.feeComparison.table.recipientGets')}</span>
          <span className="text-sm">{t('sections.feeComparison.table.totalAfterFees')}</span>
        </div>
      </div>

      {sortedProviders.map((provider) => (
        <div key={provider.name}>
          <div className="w-full my-4 border-b border-gray-200" />
          <FeeProviderRow
            provider={provider}
            onPriceFetched={handlePriceUpdate}
            isBestRate={provider.name === bestProvider.bestProvider}
            bestPrice={bestProvider.bestPrice}
            amount={amount}
            sourceAssetSymbol={sourceAssetSymbol}
            targetAssetSymbol={targetAssetSymbol}
          />
        </div>
      ))}
    </div>
  );
}
