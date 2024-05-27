import { ArrowPathRoundedSquareIcon, ChevronDownIcon } from '@heroicons/react/20/solid';
import { useEffect } from 'preact/compat';
import { Button } from 'react-daisyui';
import { useFormContext } from 'react-hook-form';

import pendulumIcon from '../../assets/pendulum-icon.svg';
import { NumberLoader } from '../Nabla/TokenBalance';
import { Skeleton } from '../Skeleton';
import { SwapFormValues } from '../Nabla/schema';
import { UseTokenOutAmountResult } from '../../hooks/nabla/useTokenAmountOut';
import { useBoolean } from '../../hooks/useBoolean';
import { TokenDetails } from '../../constants/tokenConfig';
import {BalanceInfo} from '../Nabla/BalanceState'; 

export interface ToProps {
  tokenId: string;
  onOpenSelector: () => void;
  fromToken: TokenDetails | undefined;
  toToken: TokenDetails | undefined;
  toAmountQuote: UseTokenOutAmountResult;
  fromAmount: number | undefined;
  slippage: number;
  fromTokenBalances: {[key: string]: BalanceInfo};
}

export function To({
  tokenId,
  fromToken,
  toToken,
  onOpenSelector,
  toAmountQuote,
  fromAmount,
  slippage,
  fromTokenBalances,
}: ToProps): JSX.Element | null {

  const toTokenBalance = (fromTokenBalances && tokenId && fromTokenBalances[tokenId]) ? fromTokenBalances[tokenId].approximateNumber : 0;

  // replace with use state 
  const [isOpen, { toggle }] = useBoolean(true);
  const { setValue } = useFormContext<SwapFormValues>();

  useEffect(() => {
    setValue('toAmount', toAmountQuote.data?.amountOut.preciseString ?? '0', {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  }, [toAmountQuote.data?.amountOut.preciseString, setValue]);

  return (
    <div className="rounded-lg bg-base-300 px-4 py-3 border border-transparent">
      <div className="w-full flex justify-between">
        <div className="flex-grow text-4xl text-[inherit] font-outfit overflow-x-auto overflow-y-hidden mr-2">
          {toAmountQuote.isLoading ? (
            <NumberLoader />
          ) : toAmountQuote.data !== undefined ? (
            `${toAmountQuote.data.amountOut.approximateStrings.atLeast4Decimals}`
          ) : fromAmount !== undefined && fromAmount > 0  ? (
            <button
              type="button"
              onClick={() => toAmountQuote.refetch?.()}
              className="hover:opacity-80"
              title="Refresh"
            >
              <ArrowPathRoundedSquareIcon className="w-7 h-7" />
            </button>
          ) : (
            <>0</>
          )}
        </div>
        <Button
          size="xs"
          className="rounded-full h-7 min-h-none border-0 bg-neutral-200 dark:bg-neutral-700 pl-0 pr-1 flex items-center mt-0.5 text-sm font-medium"
          onClick={onOpenSelector}
          type="button"
        >
          <span className="rounded-full bg-[rgba(0,0,0,0.15)] h-full p-px mr-1">
            {toToken && (<img src={`src/assets/coins/${toToken.assetCode.toUpperCase()}.png`} alt="Pendulum" className="h-full w-auto" />   )}
            {!toToken && <img src={pendulumIcon} alt="Pendulum" className="h-full w-auto" /> }  
          </span>
          <strong className="font-bold">{toToken?.assetCode || 'Select'}</strong>
          <ChevronDownIcon className="w-4 h-4 inline ml-px" />
        </Button>
      </div>
      <div className="flex justify-between items-center mt-1 dark:text-neutral-300 text-neutral-500">
        {/* <div className="text-sm mt-px">{toToken ? <NablaTokenPrice address={toToken.id} fallback="$ -" /> : '$ -'}</div> */}
        <div className="flex gap-1 text-sm">
          Your balance:{' '} {toTokenBalance}
        </div>
      </div>
      <div className="mt-4 h-px -mx-4 bg-[rgba(0,0,0,0.15)]" />
      <div
        className={`collapse overflow-visible dark:text-neutral-300 text-neutral-500 -mx-4 text-sm${
          isOpen ? ' collapse-open' : ''
        }`}
      >
        <div className="collapse-title cursor-pointer flex justify-between px-4 pt-3 pb-0" onClick={toggle}>
          <div className="flex items-center">
            {fromToken !== undefined &&
            toToken !== undefined &&
            !toAmountQuote.isLoading &&
            toAmountQuote.data !== undefined ? (
              <>{`1 ${fromToken.assetCode} = ${toAmountQuote.data.effectiveExchangeRate} ${toToken.assetCode}`}</>
            ) : (
              `-`
            )}
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
        <div className="collapse-content flex flex-col gap-5">
          <div className="flex justify-between pt-6">
            <div>Expected Output:</div>
            {toAmountQuote.data !== undefined ? (
              <div>
                <Skeleton isLoading={toAmountQuote.isLoading}>
                  {toAmountQuote.data?.amountOut.approximateStrings.atLeast4Decimals} {toToken?.assetCode || ''}
                </Skeleton>
              </div>
            ) : (
              <div>N/A</div>
            )}
          </div>
          <div className="flex justify-between">
            <div>Minimum received after slippage ({slippage}%)</div>
            {toAmountQuote.data !== undefined && toToken !== undefined ? (
              <div>
                <Skeleton isLoading={toAmountQuote.isLoading || toAmountQuote.data === undefined}>
                  {toAmountQuote.data !== undefined ? toAmountQuote.data.minAmountOut : ''} {toToken?.assetCode || ''}
                </Skeleton>
              </div>
            ) : (
              <div>N/A</div>
            )}
          </div>
          <div className="flex justify-between">
            <div>Swap fee:</div>
            <div>
              {toAmountQuote.data !== undefined ? toAmountQuote.data.swapFee.approximateStrings.atLeast2Decimals : ''}{' '}
              {toToken?.assetCode || ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}