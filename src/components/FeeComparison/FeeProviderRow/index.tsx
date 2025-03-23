import { useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Big from 'big.js';

import { OfframpingParameters, useEventsContext } from '../../../contexts/events';
import { Skeleton } from '../../Skeleton';
import { PriceProvider } from '../priceProviders';
import { formatPrice } from '../helpers';
import { BaseComparisonProps } from '..';

interface FeeProviderRowProps extends BaseComparisonProps {
  provider: PriceProvider;
  isBestRate: boolean;
  bestPrice: Big;
  onPriceFetched: (providerName: string, price: Big) => void;
}

export function FeeProviderRow({
  provider,
  amount,
  sourceAssetSymbol,
  targetAssetSymbol,
  vortexPrice,
  network,
  trackPrice,
  isBestRate,
  bestPrice,
  onPriceFetched,
}: FeeProviderRowProps) {
  const { schedulePrice } = useEventsContext();
  // The vortex price is sometimes lagging behind the amount (as it first has to be calculated asynchronously)
  // We keep a reference to the previous vortex price to avoid spamming the server with the same quote.
  const prevVortexPrice = useRef<Big | null>(null);
  const prevProviderPrice = useRef<Big | null>(null);

  const {
    isLoading,
    error,
    data: providerPriceRaw,
  } = useQuery({
    queryKey: [amount, sourceAssetSymbol, targetAssetSymbol, vortexPrice, provider.name, network],
    queryFn: () => provider.query(sourceAssetSymbol, targetAssetSymbol, amount, network),
    retry: false, // We don't want to retry the request to avoid spamming the server
  });

  const providerPrice = useMemo(() => {
    if (provider.name === 'vortex') return vortexPrice.gt(0) ? vortexPrice : undefined;

    return providerPriceRaw && providerPriceRaw.gte(0) ? providerPriceRaw : undefined;
  }, [providerPriceRaw, vortexPrice, provider.name]);

  const priceDiff = useMemo(() => {
    if (isLoading || error || !providerPrice) return;
    return providerPrice.minus(bestPrice);
  }, [isLoading, error, providerPrice, bestPrice]);

  useEffect(() => {
    if (isLoading || !providerPrice || error) return;
    if (prevProviderPrice.current?.eq(providerPrice)) return;

    prevProviderPrice.current = providerPrice;
  }, [isLoading, providerPrice, error, provider.name]);

  useEffect(() => {
    if (isLoading) return;
    onPriceFetched(provider.name, providerPrice ? providerPrice : new Big(0));

    if (!providerPrice && !error) return;

    const parameters: OfframpingParameters = {
      from_amount: amount.toFixed(2),
      from_asset: sourceAssetSymbol,
      to_amount: vortexPrice.toFixed(2),
      to_asset: targetAssetSymbol,
    };

    if (prevVortexPrice.current?.eq(vortexPrice)) return;
    schedulePrice(provider.name, providerPrice ? providerPrice.toFixed(2, 0) : '-1', parameters, trackPrice);
    prevVortexPrice.current = vortexPrice;
  }, [
    amount,
    provider.name,
    isLoading,
    schedulePrice,
    sourceAssetSymbol,
    targetAssetSymbol,
    providerPrice,
    vortexPrice,
    trackPrice,
    error,
    onPriceFetched,
  ]);

  return (
    <div className={`${isBestRate ? 'bg-green-500/10 rounded-md py-1' : ''}`}>
      {isBestRate && <div className="pb-1 ml-4 text-sm italic text-green-700">Best rate</div>}
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
                <div className={`flex justify-end w-full text-red-600`}>
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
