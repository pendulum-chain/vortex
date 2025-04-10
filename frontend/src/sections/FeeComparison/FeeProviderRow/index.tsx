import { useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Big from 'big.js';

import { OfframpingParameters, useEventsContext } from '../../../contexts/events';
import { Skeleton } from '../../../components/Skeleton';
import { formatPrice } from '../helpers';
import { cn } from '../../../helpers/cn';
import { useNetwork } from '../../../contexts/network';
import { PriceProvider } from '../priceProviders';
import { useQuote } from '../../../stores/ramp/useQuoteStore';
import { useRampDirection } from '../../../stores/rampDirectionStore';
import { RampDirection } from '../../../components/RampToggle';

interface FeeProviderRowProps {
  provider: PriceProvider;
  isBestRate: boolean;
  bestPrice: Big;
  onPriceFetched: (providerName: string, price: Big) => void;
  amount: Big;
  sourceAssetSymbol: string;
  targetAssetSymbol: string;
}

export function FeeProviderRow({
  provider,
  isBestRate,
  bestPrice,
  onPriceFetched,
  amount,
  sourceAssetSymbol,
  targetAssetSymbol,
}: FeeProviderRowProps) {
  const { t } = useTranslation();

  const { schedulePrice } = useEventsContext();
  // The vortex price is sometimes lagging behind the amount (as it first has to be calculated asynchronously)
  // We keep a reference to the previous vortex price to avoid spamming the server with the same quote.
  const prevVortexPrice = useRef<Big | null>(null);
  const prevProviderPrice = useRef<Big | null>(null);
  const { selectedNetwork } = useNetwork();
  const quote = useQuote();

  const rampDirection = useRampDirection();
  const isOnramp = rampDirection === RampDirection.ONRAMP;

  const vortexPrice = useMemo(() => (quote ? Big(quote.outputAmount) : Big(0)), [quote]);

  const {
    isLoading,
    error,
    data: providerPriceRaw,
  } = useQuery({
    queryKey: [amount, sourceAssetSymbol, targetAssetSymbol, vortexPrice.toString(), provider.name, selectedNetwork],
    queryFn: () => provider.query(sourceAssetSymbol, targetAssetSymbol, amount, selectedNetwork),
    retry: false,
  });

  const providerPrice = useMemo(() => {
    if (provider.name === 'vortex') return vortexPrice.gt(0) ? vortexPrice : undefined;

    // FIXME - this is a hack until we implement fetching prices for onramp providers
    if (isOnramp) return undefined

    return providerPriceRaw && providerPriceRaw.gte(0) ? providerPriceRaw : undefined;
  }, [provider.name, vortexPrice, isOnramp, providerPriceRaw]);

  const priceDiff = useMemo(() => {
    if (isLoading || error || !providerPrice) return;
    return providerPrice.minus(bestPrice);
  }, [isLoading, error, providerPrice, bestPrice]);

  useEffect(() => {
    if (isLoading) return;

    const currentPrice = providerPrice ? providerPrice : new Big(0);
    if (prevProviderPrice.current?.eq(currentPrice)) return;

    onPriceFetched(provider.name, currentPrice);
    prevProviderPrice.current = currentPrice;
  }, [isLoading, providerPrice, provider.name, onPriceFetched]);

  useEffect(() => {
    if (isLoading || !providerPrice || error) return;
    if (prevVortexPrice.current?.eq(vortexPrice)) return;

    const parameters: OfframpingParameters = {
      from_amount: amount.toFixed(2),
      from_asset: sourceAssetSymbol,
      to_amount: vortexPrice.toFixed(2),
      to_asset: targetAssetSymbol,
    };

    schedulePrice(provider.name, providerPrice.toFixed(2, 0), parameters, true);
    prevVortexPrice.current = vortexPrice;
  }, [
    isLoading,
    error,
    providerPrice,
    vortexPrice,
    amount,
    sourceAssetSymbol,
    targetAssetSymbol,
    provider.name,
    schedulePrice,
  ]);

  return (
    <div className={cn(isBestRate && 'bg-green-500/10 rounded-md py-1')}>
      {isBestRate && (
        <div className="pb-1 ml-4 text-sm italic text-green-700">{t('sections.feeComparison.table.bestRate')}</div>
      )}
      <div className="flex items-center justify-between w-full">
        <a href={provider.href} rel="noreferrer" target="_blank" className="flex items-center w-full gap-4 ml-4 grow">
          {provider.icon}
        </a>
        <div className="flex items-center justify-center w-full gap-4 grow">
          {isLoading ? (
            <Skeleton className="w-20 h-10 mb-2" />
          ) : (
            <div className="flex flex-col items-center">
              <div className="flex justify-end w-full">
                {error || !providerPrice ? (
                  <span className="font-bold text-md">N/A</span>
                ) : (
                  <>
                    <span className="font-bold text-md text-right">
                      {`${formatPrice(providerPrice)} ${targetAssetSymbol}`}
                    </span>
                  </>
                )}
              </div>
              {priceDiff && priceDiff.lt(0) && (
                <div className="flex justify-end w-full text-red-600">
                  <span className="text-right font-bold">{`${formatPrice(priceDiff)} ${targetAssetSymbol}`}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
