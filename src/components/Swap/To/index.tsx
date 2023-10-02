import { ArrowPathRoundedSquareIcon, ChevronDownIcon } from '@heroicons/react/20/solid';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { Button } from 'react-daisyui';
import { useFormContext, useWatch } from 'react-hook-form';
import pendulumIcon from '../../../assets/pendulum-icon.svg';
import { config } from '../../../config';
import { calcPercentage } from '../../../helpers/calc';
import { useTokens } from '../../../hooks/nabla/useTokens';
import useBoolean from '../../../hooks/useBoolean';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { roundNumber } from '../../../shared/parseNumbers';
import TokenPrice from '../../Asset/Price';
import Balance from '../../Balance';
import { Skeleton } from '../../Skeleton';
import { SwapFormValues } from '../types';

export interface ToProps {
  onOpenSelector: () => void;
  className?: string;
}

const To = ({ onOpenSelector, className }: ToProps): JSX.Element | null => {
  const tokensQuery = useTokens();
  const { tokensMap } = tokensQuery.data || {};
  const [isOpen, { toggle }] = useBoolean();
  const { /* setValue, */ control } = useFormContext<SwapFormValues>();
  const from = useWatch({
    control,
    name: 'from',
  });
  const to = useWatch({
    control,
    name: 'to',
  });
  const fromAmount = Number(
    useWatch({
      control,
      name: 'fromAmount',
      defaultValue: 0,
    }),
  );
  const slippage = Number(
    useWatch({
      control,
      name: 'slippage',
    }),
  );
  const fromToken = tokensMap?.[from];
  const toToken = tokensMap?.[to];
  const debouncedFromAmount = useDebouncedValue(fromAmount, 800);
  const { isLoading, data, refetch } = {
    data: debouncedFromAmount,
    isLoading: false,
    refetch: () => undefined,
  };
  /* useTokenOutAmount({
    chainId,
    amount: debouncedFromAmount,
    from,
    to,
    enabled: debouncedFromAmount > 0 && !!from && !!to,
    onSuccess: (val) => {
      setValue('toAmount', Number(BigInt(val)));
    },
  }); */
  const loading = isLoading || fromAmount !== debouncedFromAmount;
  const value = data;

  return (
    <>
      <div className={`rounded-lg bg-base-300 px-4 py-3 ${className}`}>
        <div className="w-full flex justify-between">
          <div className="flex-grow text-4xl text-[inherit] font-2">
            {isLoading ? (
              <Skeleton className="inline-flex">10000</Skeleton>
            ) : value ? (
              `${value}`
            ) : fromAmount > 0 ? (
              <button type="button" onClick={() => refetch()} className="hover:opacity-80" title="Refresh">
                <ArrowPathRoundedSquareIcon className="w-7 h-7" />
              </button>
            ) : (
              <>0</>
            )}
          </div>
          <Button
            size="xs"
            className="rounded-full h-4 min-h-none border-0 bg-neutral-200 dark:bg-neutral-700 pl-0 pr-1 flex items-center mt-0.5"
            onClick={onOpenSelector}
            type="button"
          >
            <span className="rounded-full bg-[rgba(0,0,0,0.15)] h-full p-px mr-1">
              <img src={pendulumIcon} alt="Pendulum" className="h-full w-auto" />
            </span>
            <strong className="font-bold">{toToken?.symbol}</strong>
            <ChevronDownIcon className="w-4 h-4 inline ml-px" />
          </Button>
        </div>
        <div className="flex justify-between items-center mt-1 dark:text-neutral-300 text-neutral-500">
          <div className="text-sm mt-px">{!!toToken && <TokenPrice address={toToken.id} />}</div>
          <div className="flex gap-1 text-sm">
            Balance: <Balance address={toToken?.id} />
          </div>
        </div>
        {fromAmount > 0 && (
          <>
            <div className="mt-4 h-px -mx-4 bg-[rgba(0,0,0,0.15)]" />
            <div
              className={`collapse overflow-visible dark:text-neutral-300 text-neutral-500 -mx-4 text-sm${
                isOpen ? ' collapse-open' : ''
              }`}
            >
              <div className="collapse-title cursor-pointer flex justify-between px-4 pt-3 pb-0" onClick={toggle}>
                <div className="flex items-center">
                  {fromToken && toToken && value && fromAmount ? (
                    <>
                      <div className="tooltip" data-tip="! TODO" title="! TODO">
                        <InformationCircleIcon className="w-5 h-5 mr-1" />
                      </div>
                      {`1${fromToken.symbol} = ${roundNumber(Number(value) / fromAmount, 6)}${toToken.symbol}`}
                    </>
                  ) : null}
                </div>
                <div>
                  <div
                    title="More info"
                    className="w-6 h-6 ml-1 flex items-center justify-center rounded-full bg-blackAlpha-200 dark:bg-whiteAlpha-200 hover:opacity-80"
                  >
                    <ChevronDownIcon className="w-5 h-5 inline" />
                  </div>
                </div>
              </div>
              <div className="collapse-content flex flex-col gap-4">
                <div className="mt-3 h-px -mx-4 bg-[rgba(0,0,0,0.15)]" />
                <div className="flex justify-between px-4">
                  <div>Expected Output:</div>
                  <div>
                    <Skeleton isLoading={loading}>
                      {value} {toToken?.symbol}
                    </Skeleton>
                  </div>
                </div>
                <div className="flex justify-between px-4">
                  <div>Minimum received:</div>
                  <div>
                    <Skeleton isLoading={loading}>
                      {calcPercentage(Number(value), slippage ?? config.swap.defaults.slippage)} {toToken?.symbol}
                    </Skeleton>
                  </div>
                </div>
                <div className="flex justify-between px-4">
                  <div>Price Impact:</div>
                  <div>{'! TODO'}%</div>
                </div>
                <div className="flex justify-between px-4">
                  <div>Network Fee:</div>
                  <div>{'! TODO'}</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
};
export default To;
