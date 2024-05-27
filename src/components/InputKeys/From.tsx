import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { Button } from 'react-daisyui';
import { FieldPath, FieldValues, UseFormReturn, useFormContext } from 'react-hook-form';

import pendulumIcon from '../../assets/pendulum-icon.svg';
import { TokenDetails } from '../../constants/tokenConfig';
import { AmountSelector } from './AmountSelector';
import {BalanceInfo} from '../Nabla/BalanceState'; 
import { SwapFormValues } from '../Nabla/schema';
import { TokenBalance } from '../Nabla/TokenBalance';

interface FromProps<FormFieldValues extends FieldValues, TFieldName extends FieldPath<FormFieldValues>> {
  tokenId: string;
  fromToken: TokenDetails | undefined;
  onOpenSelector: () => void;
  inputHasError: boolean;
  fromFormFieldName: TFieldName;
  form: UseFormReturn<FormFieldValues>;
  fromTokenBalances: {[key: string]: BalanceInfo};
}

export function From<FormFieldValues extends FieldValues, TFieldName extends FieldPath<FormFieldValues>>({
  tokenId,
  fromToken,
  onOpenSelector,
  inputHasError,
  fromFormFieldName,
  form,
  fromTokenBalances,
}: FromProps<FormFieldValues, TFieldName>) {
  const { setValue } = useFormContext<SwapFormValues>();
  const fromTokenBalance = tokenId ? fromTokenBalances[tokenId] : undefined;

  return (
    <div
      className={`rounded-lg bg-base-300 px-4 py-3 border ${inputHasError ? 'border-red-600' : 'border-transparent'}`}
    >
      <div className="w-full flex justify-between">
        <div className="flex-grow text-4xl text-[inherit] font-outfit">
          <AmountSelector
            maxBalance={fromTokenBalance}
            formFieldName={fromFormFieldName}
            form={form}
            onlyShowNumberInput={true}
          />
        </div>
        <Button
          size="xs"
          className="rounded-full h-7 min-h-none border-0 bg-neutral-200 dark:bg-neutral-700 pl-0 pr-1 flex items-center mt-0.5 text-sm font-medium"
          onClick={onOpenSelector}
          type="button"
        >
          <span className="rounded-full bg-[rgba(0,0,0,0.15)] h-full p-px mr-1">
            {fromToken && (<img src={`src/assets/coins/${fromToken.assetCode.toUpperCase()}.png`} alt="Pendulum" className="h-full w-auto" />   )}
            {!fromToken && <img src={pendulumIcon} alt="Pendulum" className="h-full w-auto" /> }
          </span>
          <strong className="font-bold">{fromToken?.assetCode || 'Select'}</strong>
          <ChevronDownIcon className="w-4 h-4 inline ml-px" />
        </Button>
      </div>
      <div className="flex justify-between items-center mt-1 dark:text-neutral-400 text-neutral-500">
        <div className="flex gap-1 text-sm">
          {fromTokenBalance !== undefined && (
            <>
              <span className="mr-1">
                Your Balance: <TokenBalance query={fromTokenBalance} symbol={fromToken?.assetCode}></TokenBalance>
              </span>
              <button
                className="text-primary hover:underline"
                onClick={() => {
                  if (fromTokenBalance.approximateNumber !== undefined) {
                    setValue('fromAmount',(fromTokenBalance.approximateNumber*0.5).toString());
                  }
                }}
                type="button"
              >
                50%
              </button>
              <button
                className="text-primary hover:underline"
                onClick={() => {
                  if (fromTokenBalance.approximateNumber !== undefined) {
                    setValue('fromAmount', (fromTokenBalance.approximateNumber).toString());
                  }
                }}
                type="button"
              >
                MAX
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}