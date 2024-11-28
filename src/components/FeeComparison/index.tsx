import Big from 'big.js';
import { useMemo } from 'preact/hooks';
import { useEffect, useRef } from 'preact/compat';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { Skeleton } from '../Skeleton';
import vortexIcon from '../../assets/logo/blue.svg';
import { QuoteProvider, quoteProviders } from './quoteProviders';
import { NetworkType } from '../../constants/tokenConfig';
import { OfframpingParameters, useEventsContext } from '../../contexts/events';

type FeeProviderRowProps = FeeComparisonProps & { provider: QuoteProvider };

function VortexRow({
  targetAssetSymbol,
  vortexPrice,
}: Omit<FeeProviderRowProps, 'provider' | 'sourceAssetSymbol' | 'amount'>) {
  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-4 w-full grow ml-4">
        <img src={vortexIcon} className="w-36 h-10" alt="Vortex" />
      </div>
      <div className="flex items-center justify-center gap-4 w-full grow">
        <div className="flex flex-col items-center">
          <span className="text-md font-bold">{vortexPrice.toFixed(2) + ' ' + targetAssetSymbol}</span>
        </div>
      </div>
    </div>
  );
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

  const {
    isLoading,
    error,
    data: providerPrice,
  } = useQuery({
    queryKey: [amount, sourceAssetSymbol, targetAssetSymbol, vortexPrice, provider.name, network],
    queryFn: () => provider.query(sourceAssetSymbol, targetAssetSymbol, amount, network),
    retry: false, // We don't want to retry the request to avoid spamming the server
  });
  // The vortex price is sometimes lagging behind the amount (as it first has to be calculated asynchronously)
  // We keep a reference to the previous vortex price to avoid spamming the server with the same quote.
  const prevVortexPrice = useRef<Big | undefined>(undefined);

  const priceDiff = useMemo(() => {
    if (isLoading || error || !providerPrice) {
      return undefined;
    }

    return providerPrice.minus(vortexPrice);
  }, [isLoading, error, providerPrice, vortexPrice]);

  useEffect(() => {
    if (!isLoading && (providerPrice || error)) {
      const parameters: OfframpingParameters = {
        from_amount: amount.toFixed(2),
        from_asset: sourceAssetSymbol,
        to_amount: vortexPrice.toFixed(2),
        to_asset: targetAssetSymbol,
      };
      if (!prevVortexPrice.current || vortexPrice !== prevVortexPrice.current) {
        scheduleQuote(provider.name, providerPrice ? providerPrice.toFixed(2, 0) : '-1', parameters);
        prevVortexPrice.current = vortexPrice;
      }
    }
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
      <a href={provider.href} target="_blank" className="flex items-center gap-4 w-full grow ml-4">
        {provider.icon}
      </a>
      <div className="flex items-center justify-center gap-4 w-full grow">
        {isLoading ? (
          <Skeleton className="w-20 h-10 mb-2" />
        ) : (
          <div className="flex flex-col items-center">
            <span className="text-md font-bold">
              {error || !providerPrice ? 'N/A' : providerPrice.toFixed(2) + ' ' + targetAssetSymbol}
            </span>
            {priceDiff && (
              <span className={`flex items-center ${priceDiff.gt(0) ? 'text-green-600' : 'text-red-600'}`}>
                <ChevronDownIcon className={`w-5 h-5 ${priceDiff.gt(0) ? 'rotate-180' : ''}`} /> {priceDiff.toFixed(2)}{' '}
                {targetAssetSymbol}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type FeeComparisonTableProps = FeeComparisonProps;

function FeeComparisonTable({
  amount,
  sourceAssetSymbol,
  targetAssetSymbol,
  vortexPrice,
  network,
}: FeeComparisonTableProps) {
  return (
    <div className="grow w-full rounded-3xl shadow-custom p-4">
      <div className="flex items-center justify-center w-full mb-3">
        <div className="flex items-center justify-center gap-4 w-full">
          <span className="text-md font-bold">
            Sending {amount.toFixed(2)} {sourceAssetSymbol} <br /> with
          </span>
        </div>
        <div className="flex flex-col items-center justify-center w-full">
          <span className="text-md font-bold">Recipient gets</span>
          <span className="text-sm">(Total after fees)</span>
        </div>
      </div>
      <div className="border-b border-gray-200 w-full my-4" />
      <VortexRow targetAssetSymbol={targetAssetSymbol} vortexPrice={vortexPrice} network={network} />
      {quoteProviders.map((provider, index) => (
        <>
          <div className="border-b border-gray-200 w-full my-4" />
          <FeeProviderRow
            key={index}
            amount={amount}
            provider={provider}
            sourceAssetSymbol={sourceAssetSymbol}
            targetAssetSymbol={targetAssetSymbol}
            vortexPrice={vortexPrice}
            network={network}
          />
        </>
      ))}
    </div>
  );
}

interface FeeComparisonProps {
  amount: Big;
  sourceAssetSymbol: string;
  targetAssetSymbol: string;
  vortexPrice: Big;
  network: NetworkType;
}

export function FeeComparison({
  amount,
  sourceAssetSymbol,
  targetAssetSymbol,
  vortexPrice,
  network,
}: FeeComparisonProps) {
  return (
    <div className="flex items-center flex-col md:flex-row gap-x-8 gap-y-8 max-w-4xl px-4 py-8 rounded-lg md:mx-auto md:w-3/4">
      <div className="grow w-full overflow-auto gap-6">
        <h1 className="text-2xl font-bold">Save on exchange rate markups</h1>
        <p className="text-lg mt-4">
          The cost of your transfer comes from the fee and the exchange rate. Many providers offer “no fee”, while
          hiding a markup in the exchange rate, making you pay more.
        </p>
        <p className="text-lg mt-4">At Vortex, we’ll never do that and show our fees upfront.</p>
      </div>
      <FeeComparisonTable
        amount={amount}
        sourceAssetSymbol={sourceAssetSymbol}
        targetAssetSymbol={targetAssetSymbol}
        vortexPrice={vortexPrice}
        network={network}
      />
    </div>
  );
}
