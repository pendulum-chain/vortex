import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { Fragment } from 'preact';
import { Button } from 'react-daisyui';
import { useFormContext, useWatch } from 'react-hook-form';
import pendulumIcon from '../../../assets/pendulum-icon.svg';
import { useTokens } from '../../../hooks/nabla/useTokens';
import { useContractBalance } from '../../../shared/useContractBalance';
import TokenPrice from '../../Asset/Price';
import { SwapFormValues } from '../types';

export interface FromProps {
  onOpenSelector: () => void;
  className?: string;
}

const From = ({ onOpenSelector, className }: FromProps): JSX.Element | null => {
  const { data } = useTokens();
  const { tokensMap } = data || {};
  const { register, setValue, control } = useFormContext<SwapFormValues>();
  const from = useWatch({
    control,
    name: 'from',
  });
  const token = tokensMap?.[from];
  const { formatted, balance } = useContractBalance({ contractAddress: token?.id });
  return (
    <>
      <div className={`rounded-lg bg-base-300 px-4 py-3 ${className}`}>
        <div className="w-full flex justify-between">
          <div className="flex-grow text-4xl text-[inherit] font-2">
            <input
              autoFocus
              className="input-ghost w-full text-4xl font-2"
              placeholder="0.0"
              {...register('fromAmount', { onChange: () => undefined })}
            />
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
            <strong className="font-bold">{token?.symbol}</strong>
            <ChevronDownIcon className="w-4 h-4 inline ml-px" />
          </Button>
        </div>
        <div className="flex justify-between items-center mt-1 dark:text-neutral-400 text-neutral-500">
          <div className="text-sm mt-px">{!!token && <TokenPrice address={token.id} />}</div>
          <div className="flex gap-1 text-sm">
            {balance !== undefined && (
              <Fragment>
                <span className="mr-1">Balance: {formatted}</span>
                <button
                  className="text-primary hover:underline"
                  onClick={() => setValue('fromAmount', Number(balance))}
                  type="button"
                >
                  MAX
                </button>
                <button
                  className="text-primary hover:underline"
                  onClick={() => setValue('fromAmount', Number(balance) * 0.5)}
                  type="button"
                >
                  50%
                </button>
              </Fragment>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
export default From;
