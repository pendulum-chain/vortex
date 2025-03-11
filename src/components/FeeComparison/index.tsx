import Big from 'big.js';
import { useEffect, useRef, useMemo, useImperativeHandle, useCallback, useState } from 'react';
import { forwardRef } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getNetworkDisplayName, isNetworkEVM, Networks } from '../../helpers/networks';
import { Skeleton } from '../Skeleton';
import { QuoteProvider, quoteProviders } from './quoteProviders';
import { OfframpingParameters, useEventsContext } from '../../contexts/events';

interface BaseComparisonProps {
  amount: Big;
  sourceAssetSymbol: string;
  targetAssetSymbol: string;
  vortexPrice: Big;
  network: Networks;
  trackQuote: boolean;
}

export function formatPrice(price: Big | null | undefined): string {
  if (!price) return '0.00';
  const userLocale = navigator.language;

  return new Intl.NumberFormat(userLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(price.toFixed(2)));
}

interface FeeProviderRowProps extends BaseComparisonProps {
  provider: QuoteProvider;
  isBestRate: boolean;
  bestPrice: Big;
  onPriceFetched: (providerName: string, price: Big) => void;
}

function FeeProviderRow({
  provider,
  amount,
  sourceAssetSymbol,
  targetAssetSymbol,
  vortexPrice,
  network,
  trackQuote,
  isBestRate,
  bestPrice,
  onPriceFetched,
}: FeeProviderRowProps) {
  const { scheduleQuote } = useEventsContext();
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
    onPriceFetched(provider.name, providerPrice ? providerPrice : new Big('0'));

    if (!providerPrice && !error) return;

    const parameters: OfframpingParameters = {
      from_amount: amount.toFixed(2),
      from_asset: sourceAssetSymbol,
      to_amount: vortexPrice.toFixed(2),
      to_asset: targetAssetSymbol,
    };

    if (prevVortexPrice.current?.eq(vortexPrice)) return;
    scheduleQuote(provider.name, providerPrice ? providerPrice.toFixed(2, 0) : '-1', parameters, trackQuote);
    prevVortexPrice.current = vortexPrice;
  }, [
    amount,
    provider.name,
    isLoading,
    scheduleQuote,
    sourceAssetSymbol,
    targetAssetSymbol,
    providerPrice,
    vortexPrice,
    trackQuote,
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

function FeeComparisonTable(props: BaseComparisonProps) {
  const { amount, sourceAssetSymbol, network, vortexPrice } = props;

  const [providerPrices, setProviderPrices] = useState<{ [key: string]: Big }>({});

  const handlePriceUpdate = useCallback((providerName: string, price: Big) => {
    setProviderPrices((prev) => ({ ...prev, [providerName]: price }));
  }, []);

  const bestProvider = Object.entries(providerPrices).reduce(
    (best, [provider, price]) => {
      return price.gt(best.bestPrice) ? { bestPrice: price, bestProvider: provider } : best;
    },
    { bestPrice: new Big(0), bestProvider: '' },
  );

  const quoteProvidersOrdered = quoteProviders.sort((a, b) => {
    const aPrice = providerPrices[a.name] ?? new Big(0);
    const bPrice = providerPrices[b.name] ?? new Big(0);
    return bPrice.minus(aPrice).toNumber();
  });
  return (
    <div className="p-4 transition-all pb-8 duration-300 bg-white rounded-2xl shadow-custom hover:scale-[101%]">
      <div className="flex items-center justify-center w-full mb-3">
        <div className="flex items-center justify-center w-full gap-4">
          <span className="font-bold text-md">
            Sending {amount.toFixed(2)} {sourceAssetSymbol}{' '}
            {isNetworkEVM(network) ? (
              <></>
            ) : (
              <div
                className="tooltip tooltip-primary before:whitespace-pre-wrap before:content-[attr(data-tip)]"
                data-tip={`Quotes are for Polygon, as the providers don't support ${getNetworkDisplayName(network)}.`}
              >
                <span translate="no">(Polygon)</span>
              </div>
            )}{' '}
            with
          </span>
        </div>
        <div className="flex flex-col items-center justify-center w-full">
          <span className="font-bold text-md">Recipient gets</span>
          <span className="text-sm">(Total after fees)</span>
        </div>
      </div>

      {quoteProvidersOrdered.map((provider) => (
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

export interface FeeComparisonRef {
  scrollIntoView: (options?: ScrollIntoViewOptions) => void;
}

export const FeeComparison = forwardRef<FeeComparisonRef, BaseComparisonProps>(function FeeComparison(props, ref) {
  const feeComparisonRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    scrollIntoView: (options?: ScrollIntoViewOptions) => {
      feeComparisonRef.current?.scrollIntoView(options || { block: 'start', behavior: 'smooth' });
    },
  }));

  return (
    <section
      ref={feeComparisonRef}
      className="py-24 mt-10 mb-24 bg-[radial-gradient(at_74%_98%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))]"
    >
      <div className="container grid grid-cols-1 grid-rows-2 md:grid-rows-1 md:grid-cols-2 px-4 py-8 gap-x-20 mx-auto">
        <div className="text-white max-w-4xl">
          <h1 className="text-4xl">
            <strong className="text-blue-400">Save</strong> on exchange rate markups
          </h1>
          <p className="mt-4 text-lg">
            The cost of your transfer comes from the fee and the exchange rate. Many providers offer{' '}
            <em className="font-bold text-blue-400">“no fee”</em>, while hiding a markup in the exchange rate, making
            you pay more.
          </p>
          <p className="mt-4 text-lg">At Vortex, we’ll never do that and show our fees upfront.</p>
        </div>
        <FeeComparisonTable {...props} />
      </div>
    </section>
  );
});
