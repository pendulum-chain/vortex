import Big from 'big.js';
import { useEffect, useRef, useMemo, useImperativeHandle } from 'react';
import { forwardRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon } from '@heroicons/react/20/solid';

import vortexIcon from '../../assets/logo/blue.svg';
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
}

type VortexRowProps = Pick<BaseComparisonProps, 'targetAssetSymbol' | 'vortexPrice'>;

function VortexRow({ targetAssetSymbol, vortexPrice }: VortexRowProps) {
  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center w-full gap-4 ml-4 grow">
        <img src={vortexIcon} className="h-10 w-36" alt="Vortex" />
      </div>
      <div className="flex items-center justify-center w-full gap-4 grow">
        <div className="flex flex-col items-center">
          <span className="font-bold text-md">{`${vortexPrice.toFixed(2)} ${targetAssetSymbol}`}</span>
        </div>
      </div>
    </div>
  );
}

interface FeeProviderRowProps extends BaseComparisonProps {
  provider: QuoteProvider;
}

function FeeProviderRow({
  provider,
  amount,
  sourceAssetSymbol,
  targetAssetSymbol,
  vortexPrice,
  network,
}: FeeProviderRowProps) {
  const { scheduleQuote } = useEventsContext();
  // The vortex price is sometimes lagging behind the amount (as it first has to be calculated asynchronously)
  // We keep a reference to the previous vortex price to avoid spamming the server with the same quote.
  const prevVortexPrice = useRef<Big | null>(null);

  const {
    isLoading,
    error,
    data: providerPrice,
  } = useQuery({
    queryKey: [amount, sourceAssetSymbol, targetAssetSymbol, vortexPrice, provider.name, network],
    queryFn: () => provider.query(sourceAssetSymbol, targetAssetSymbol, amount, network),
    retry: false, // We don't want to retry the request to avoid spamming the server
  });

  const priceDiff = useMemo(() => {
    if (isLoading || error || !providerPrice) return undefined;
    return providerPrice.minus(vortexPrice);
  }, [isLoading, error, providerPrice, vortexPrice]);

  useEffect(() => {
    if (isLoading || (!providerPrice && !error)) return;

    const parameters: OfframpingParameters = {
      from_amount: amount.toFixed(2),
      from_asset: sourceAssetSymbol,
      to_amount: vortexPrice.toFixed(2),
      to_asset: targetAssetSymbol,
    };

    if (prevVortexPrice.current?.eq(vortexPrice)) return;

    scheduleQuote(provider.name, providerPrice ? providerPrice.toFixed(2, 0) : '-1', parameters);
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
    error,
  ]);

  return (
    <div className="flex items-center justify-between w-full">
      <a href={provider.href} rel="noreferrer" target="_blank" className="flex items-center w-full gap-4 ml-4 grow">
        {provider.icon}
      </a>
      <div className="flex items-center justify-center w-full gap-4 grow">
        {isLoading ? (
          <Skeleton className="w-20 h-10 mb-2" />
        ) : (
          <div className="flex flex-col items-center">
            <span className="font-bold text-md">
              {error || !providerPrice ? 'N/A' : `${providerPrice.toFixed(2)} ${targetAssetSymbol}`}
            </span>
            {priceDiff && (
              <span className={`flex items-center ${priceDiff.gt(0) ? 'text-green-600' : 'text-red-600'}`}>
                <ChevronDownIcon className={`w-5 h-5 ${priceDiff.gt(0) ? 'rotate-180' : ''}`} />
                {`${priceDiff.toFixed(2)} ${targetAssetSymbol}`}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FeeComparisonTable(props: BaseComparisonProps) {
  const { amount, sourceAssetSymbol, network, targetAssetSymbol, vortexPrice } = props;

  return (
    <div className="w-full p-4 grow rounded-3xl shadow-custom">
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
      <div className="w-full my-4 border-b border-gray-200" />
      <VortexRow targetAssetSymbol={targetAssetSymbol} vortexPrice={vortexPrice} />
      {quoteProviders.map((provider) => (
        <div key={provider.name}>
          <div className="w-full my-4 border-b border-gray-200" />
          <FeeProviderRow {...props} provider={provider} />
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
    <div
      ref={feeComparisonRef}
      className="flex flex-col items-center max-w-4xl px-4 py-8 rounded-lg md:flex-row gap-x-8 gap-y-8 md:mx-auto md:w-3/4"
    >
      <div className="w-full gap-6 overflow-auto grow">
        <h1 className="text-2xl font-bold">Save on exchange rate markups</h1>
        <p className="mt-4 text-lg">
          The cost of your transfer comes from the fee and the exchange rate. Many providers offer “no fee”, while
          hiding a markup in the exchange rate, making you pay more.
        </p>
        <p className="mt-4 text-lg">At Vortex, we’ll never do that and show our fees upfront.</p>
      </div>
      <FeeComparisonTable {...props} />
    </div>
  );
});
