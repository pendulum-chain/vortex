import Big from 'big.js';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PriceEndpoints } from 'shared';

import { RampDirection } from '../../../components/RampToggle';
import { Skeleton } from '../../../components/Skeleton';
import { OfframpingParameters, useEventsContext } from '../../../contexts/events';
import { cn } from '../../../helpers/cn';
import { useQuote } from '../../../stores/ramp/useQuoteStore';
import { useRampDirection } from '../../../stores/rampDirectionStore';
import { formatPrice } from '../helpers';
import { PriceProvider } from '../priceProviders';

interface FeeProviderRowProps {
  provider: PriceProvider;
  isBestRate: boolean;
  bestPrice: Big;
  isLoading: boolean;
  result?: PriceEndpoints.BundledPriceResult;
  amountRaw: string;
  sourceAssetSymbol: string;
  targetAssetSymbol: string;
}

export function FeeProviderRow({
  provider,
  isBestRate,
  bestPrice,
  isLoading,
  result,
  amountRaw,
  sourceAssetSymbol,
  targetAssetSymbol,
}: FeeProviderRowProps) {
  const { t } = useTranslation();

  const { schedulePrice } = useEventsContext();
  // The vortex price is sometimes lagging behind the amount (as it first has to be calculated asynchronously)
  // We keep a reference to the previous vortex price to avoid spamming the server with the same quote.
  const prevVortexPrice = useRef<Big | null>(null);
  const prevProviderPrice = useRef<Big | null>(null);
  const quote = useQuote();

  const rampDirection = useRampDirection();
  const isOnramp = rampDirection === RampDirection.ONRAMP;

  const vortexPrice = useMemo(() => (quote ? Big(quote.outputAmount) : Big(0)), [quote]);

  const amount = useMemo(() => Big(amountRaw || '0'), [amountRaw]);

  // Determine if there's an error from the result
  const error = result?.status === 'rejected' ? result.reason : undefined;

  // Calculate provider price based on the result or vortex price
  const providerPrice = useMemo(() => {
    if (provider.name === 'vortex') return vortexPrice.gt(0) ? vortexPrice : undefined;

    // FIXME - this is a hack until we implement fetching prices for onramp providers
    if (isOnramp) return undefined;

    if (result?.status === 'fulfilled' && result.value.fiatAmount) {
      return Big(result.value.fiatAmount);
    }

    return undefined;
  }, [provider.name, vortexPrice, isOnramp, result]);

  const priceDiff = useMemo(() => {
    if (isLoading || error || !providerPrice) return;
    return providerPrice.minus(bestPrice);
  }, [isLoading, error, providerPrice, bestPrice]);

  // Update the parent component with the price
  useEffect(() => {
    if (isLoading) return;

    const currentPrice = providerPrice ? providerPrice : new Big(0);
    if (prevProviderPrice.current?.eq(currentPrice)) return;

    // No need to call onPriceFetched as the parent now manages prices
    prevProviderPrice.current = currentPrice;
  }, [isLoading, providerPrice]);

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
