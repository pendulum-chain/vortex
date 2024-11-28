import Big from 'big.js';
import { useMemo } from 'preact/hooks';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { Skeleton } from '../Skeleton';
import vortexIcon from '../../assets/logo/blue.svg';
import { QuoteProvider, quoteProviders } from './quoteProviders';
import { SupportedNetworks } from '../../services/quotes';
import { Networks } from '../../contexts/network';

type FeeProviderRowProps = FeeComparisonProps & { provider: QuoteProvider };

function VortexRow({
  targetAssetSymbol,
  vortexPrice,
}: Omit<FeeProviderRowProps, 'provider' | 'sourceAssetSymbol' | 'amount'>) {
  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center w-full gap-4 ml-4 grow">
        <img src={vortexIcon} className="h-10 w-36" alt="Vortex" />
      </div>
      <div className="flex items-center justify-center w-full gap-4 grow">
        <div className="flex flex-col items-center">
          <span className="font-bold text-md">{vortexPrice.toFixed(2) + ' ' + targetAssetSymbol}</span>
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
  const { isLoading, error, data } = useQuery({
    queryKey: [sourceAssetSymbol, targetAssetSymbol, vortexPrice, provider.name, network],
    queryFn: () => provider.query(sourceAssetSymbol, targetAssetSymbol, amount, network),
    retry: false, // We don't want to retry the request to avoid spamming the server
  });

  const providerPrice = data?.lt(0) ? undefined : data;

  const priceDiff = useMemo(() => {
    if (isLoading || error || !providerPrice) {
      return undefined;
    }

    return providerPrice.minus(vortexPrice);
  }, [isLoading, error, providerPrice, vortexPrice]);

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
    <div className="w-full p-4 grow rounded-3xl shadow-custom">
      <div className="flex items-center justify-center w-full mb-3">
        <div className="flex items-center justify-center w-full gap-4">
          <span className="font-bold text-md">
            Sending {amount.toFixed(2)} {sourceAssetSymbol} <br /> with
          </span>
        </div>
        <div className="flex flex-col items-center justify-center w-full">
          <span className="font-bold text-md">Recipient gets</span>
          <span className="text-sm">(Total after fees)</span>
        </div>
      </div>
      <div className="w-full my-4 border-b border-gray-200" />
      <VortexRow targetAssetSymbol={targetAssetSymbol} vortexPrice={vortexPrice} network={network} />
      {quoteProviders.map((provider, index) => (
        <>
          <div className="w-full my-4 border-b border-gray-200" />
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
  network: Networks;
}

export function FeeComparison({
  amount,
  sourceAssetSymbol,
  targetAssetSymbol,
  vortexPrice,
  network,
}: FeeComparisonProps) {
  return (
    <div className="flex flex-col items-center max-w-4xl px-4 py-8 rounded-lg md:flex-row gap-x-8 gap-y-8 md:mx-auto md:w-3/4">
      <div className="w-full gap-6 overflow-auto grow">
        <h1 className="text-2xl font-bold">Save on exchange rate markups</h1>
        <p className="mt-4 text-lg">
          The cost of your transfer comes from the fee and the exchange rate. Many providers offer “no fee”, while
          hiding a markup in the exchange rate, making you pay more.
        </p>
        <p className="mt-4 text-lg">At Vortex, we’ll never do that and show our fees upfront.</p>
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
