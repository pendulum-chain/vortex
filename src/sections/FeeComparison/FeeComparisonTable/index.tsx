import { useCallback, useState } from 'react';
import Big from 'big.js';
import { useTranslation } from 'react-i18next';

import { getNetworkDisplayName, isNetworkEVM } from '../../../helpers/networks';
import { quoteProviders } from '../quoteProviders';
import { FeeProviderRow } from '../FeeProviderRow';
import { BaseComparisonProps } from '..';

export function FeeComparisonTable(props: BaseComparisonProps) {
  const { amount, sourceAssetSymbol, network, vortexPrice } = props;

  const [providerPrices, setProviderPrices] = useState<Record<string, Big>>({});

  const handlePriceUpdate = useCallback((providerName: string, price: Big) => {
    setProviderPrices((prev) => ({ ...prev, [providerName]: price }));
  }, []);

  const bestProvider = Object.entries(providerPrices).reduce(
    (best, [provider, price]) => {
      return price.gt(best.bestPrice) ? { bestPrice: price, bestProvider: provider } : best;
    },
    { bestPrice: new Big(0), bestProvider: '' },
  );
  const { t } = useTranslation();

  const sortedProviders = quoteProviders.sort((a, b) => {
    const aPrice = providerPrices[a.name] ?? new Big(0);
    const bPrice = providerPrices[b.name] ?? new Big(0);
    return bPrice.minus(aPrice).toNumber();
  });
  const networkDisplay = !isNetworkEVM(network) ? (
    <div
      className="tooltip tooltip-primary before:whitespace-pre-wrap before:content-[attr(data-tip)]"
      data-tip={t('sections.feeComparison.table.tooltip', { network: getNetworkDisplayName(network) })}
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
            {...props}
            provider={provider}
            onPriceFetched={handlePriceUpdate}
            isBestRate={provider.name === bestProvider.bestProvider}
            bestPrice={bestProvider.bestPrice}
            vortexPrice={vortexPrice}
          />
        </div>
      ))}
    </div>
  );
}
