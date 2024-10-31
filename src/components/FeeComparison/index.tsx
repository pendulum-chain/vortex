import Big from 'big.js';
import { useMemo } from 'preact/hooks';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { getQueryFnForService, QuoteQuery } from '../../services/quotes';
import { Skeleton } from '../Skeleton';
import alchemyPayIcon from '../../assets/alchemypay.svg';
import transakIcon from '../../assets/transak.svg';
import vortexIcon from '../../assets/logo/blue.svg';

interface QuoteProvider {
  name: string;
  icon?: JSX.Element;
  query: QuoteQuery;
  href: string;
}

const providers: QuoteProvider[] = [
  {
    name: 'AlchemyPay',
    icon: <img src={alchemyPayIcon} className="w-40" alt="AlchemyPay" />,
    query: getQueryFnForService('alchemypay'),
    href: 'https://alchemypay.org',
  },
  // { name: 'MoonPay', icon: undefined, query: getQuoteFromService('moonpay') },
  {
    name: 'Transak',
    icon: <img src={transakIcon} className="w-30 h-10" alt="Transak" />,
    query: getQueryFnForService('transak'),
    href: 'https://transak.com',
  },
];

interface FeeProviderRowProps {
  provider: QuoteProvider;
  amount: Big;
  sourceCurrency: string;
  targetCurrency: string;
  vortexPrice: Big;
}

function FeeProviderRow({ provider, amount, sourceCurrency, targetCurrency, vortexPrice }: FeeProviderRowProps) {
  const { isLoading, error, data } = useQuery({
    queryKey: [sourceCurrency, targetCurrency, amount, provider.name],
    queryFn: () => provider.query(sourceCurrency, targetCurrency, amount),
  });

  const priceDiff = useMemo(() => {
    if (isLoading || error || !data) {
      return undefined;
    }

    return data.minus(vortexPrice);
  }, [isLoading, error, data, vortexPrice]);

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
              {error ? 'N/A' : (data ? data.toFixed(2) : '0') + ' ' + targetCurrency}
            </span>
            {priceDiff && (
              <span className={`flex items-center ${priceDiff.gt(0) ? 'text-green-600' : 'text-red-600'}`}>
                <ChevronDownIcon className={`w-5 h-5 ${priceDiff.gt(0) ? 'rotate-180' : ''}`} /> {priceDiff.toFixed(2)}{' '}
                {targetCurrency}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function VortexRow({ targetCurrency, vortexPrice }: { targetCurrency: string; vortexPrice: Big }) {
  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-4 w-full grow ml-4">
        <img src={vortexIcon} className="w-36 h-10" alt="Vortex" />
      </div>
      <div className="flex items-center justify-center gap-4 w-full grow">
        <div className="flex flex-col items-center">
          <span className="text-md font-bold">{vortexPrice.toFixed(2) + ' ' + targetCurrency}</span>
        </div>
      </div>
    </div>
  );
}

interface FeeComparisonTableProps {
  amount: Big;
  sourceCurrency: string;
  targetCurrency: string;
  vortexPrice: Big;
}

function FeeComparisonTable({ amount, sourceCurrency, targetCurrency, vortexPrice }: FeeComparisonTableProps) {
  const amountString = amount.toFixed(2);

  return (
    <div className="grow w-full rounded-3xl shadow-custom p-4">
      <div className="flex items-center justify-center w-full mb-3">
        <div className="flex items-center justify-center gap-4 w-full">
          <span className="text-md font-bold">
            Sending {amountString} {sourceCurrency} <br /> with
          </span>
        </div>
        <div className="flex flex-col items-center justify-center w-full">
          <span className="text-md font-bold">Recipient gets</span>
          <span className="text-sm">(Total after fees)</span>
        </div>
      </div>
      <div className="border-b border-gray-200 w-full my-4" />
      <VortexRow targetCurrency={targetCurrency} vortexPrice={vortexPrice} />
      {providers.map((provider, index) => (
        <>
          <div className="border-b border-gray-200 w-full my-4" />
          <FeeProviderRow
            key={index}
            amount={amount}
            provider={provider}
            sourceCurrency={sourceCurrency}
            targetCurrency={targetCurrency}
            vortexPrice={vortexPrice}
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
}

export function FeeComparison({ amount, sourceAssetSymbol, targetAssetSymbol, vortexPrice }: FeeComparisonProps) {
  return (
    <div className="flex items-center flex-col md:flex-row gap-x-8 gap-y-8 max-w-4xl px-4 py-8 rounded-lg md:mx-auto md:w-3/4 md:h-[40vh]">
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
        sourceCurrency={sourceAssetSymbol}
        targetCurrency={targetAssetSymbol}
        vortexPrice={vortexPrice}
      />
    </div>
  );
}
