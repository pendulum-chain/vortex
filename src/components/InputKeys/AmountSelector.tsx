import { Button, Range } from 'react-daisyui';
import { FieldPath, FieldValues, PathValue, UseFormReturn, useWatch } from 'react-hook-form';
import { useEffect, useMemo } from 'preact/hooks';

import { NumberInput } from './NumberInput';
import { ChangeEvent, ReactNode } from 'preact/compat';
import { BalanceInfo } from './BalanceState';

interface AmountSelectorProps<FormFieldValues extends FieldValues, TFieldName extends FieldPath<FormFieldValues>> {
  maxBalance: BalanceInfo | undefined;
  formFieldName: TFieldName;
  form: UseFormReturn<FormFieldValues>;
  children?: ReactNode;
  onlyShowNumberInput?: boolean;
}

export function AmountSelector<FormFieldValues extends FieldValues, TFieldName extends FieldPath<FormFieldValues>>({
  formFieldName,
  maxBalance,
  form,
  children,
  onlyShowNumberInput,
}: AmountSelectorProps<FormFieldValues, TFieldName>) {
  type K = PathValue<FormFieldValues, TFieldName>;

  const { setError, clearErrors, setValue } = form;

  const amountString: string = useWatch({
    control: form.control,
    name: formFieldName,
    defaultValue: '0' as K,
  });

  //DEPRECATED: will always be undefinied for less than 1 values with this library
  // const amountBigDecimal = useMemo(() => {
  //   try {
  //     return new BigNumber(amountString);
  //   } catch {
  //     return undefined;
  //   }
  // }, [amountString]);

  const amountNumber = useMemo(() => {
    try {
      return Number(amountString);
    } catch {
      return undefined;
    }
  }, [amountString]);

  useEffect(() => {
    const determineErrorMessage = (): string | undefined => {
      if (amountString.length === 0) return;
      if (amountNumber === undefined )return 'Enter a proper number';
      if (maxBalance === undefined) return;
      //if (amountBigDecimal.gt(maxBalance.preciseBigDecimal)) return 'Amount exceeds maximum';

      // if (amountBigDecimal.c[0] !== 0) {
      //   if (amountBigDecimal.e + 1 + maxBalance.decimals < amountBigDecimal.c.length)
      //     return `The number you entered must have at most ${maxBalance.decimals} decimal places`;
      // }
    };

    const errorMessage = determineErrorMessage();
    if (errorMessage) {
      setError(formFieldName, { type: 'custom', message: errorMessage });
    } else {
      clearErrors(formFieldName);
    }
  }, [amountString, formFieldName, maxBalance, setError, clearErrors]);

  if (onlyShowNumberInput === true) {
    return (
      <NumberInput
        autoFocus
        className="input-ghost w-full text-4xl font-outfit"
        placeholder="Amount"
        registerName={formFieldName}
      />
    );
  }

  return (
    <div className="relative rounded-lg bg-neutral-100 dark:bg-neutral-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          <NumberInput
            autoFocus
            className="input-ghost w-full flex-grow text-4xl font-outfit px-0 py-3"
            placeholder="Amount"
            registerName={formFieldName}
          />
          <Button
            className="bg-neutral-200 dark:bg-neutral-800 px-3 rounded-2xl"
            size="sm"
            type="button"
            onClick={() => {
              if (maxBalance !== undefined) {
                setValue(formFieldName, (maxBalance.approximateNumber/100).toString() as K, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }
            }}
          >
            50%
          </Button>
          <Button
            className="bg-neutral-200 dark:bg-neutral-800 px-3 rounded-2xl"
            size="sm"
            type="button"
            onClick={() => {
              if (maxBalance !== undefined) {
                setValue(formFieldName, (maxBalance.approximateNumber/100).toString() as K, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }
            }}
          >
            MAX
          </Button>
        </div>
      </div>
      <Range
        color={maxBalance === undefined ? 'secondary' : 'primary'}
        min={0}
        max={100}
        size="sm"
        disabled={maxBalance === undefined}
        value={amountNumber && maxBalance ? amountNumber/maxBalance.approximateNumber * 100 : 0}
        onChange={(ev: ChangeEvent<HTMLInputElement>) => {
          if (maxBalance === undefined) return;
          setValue(formFieldName, (maxBalance.approximateNumber/Number(ev.currentTarget.value)).toString() as K, {
            shouldDirty: true,
            shouldTouch: false,
          });
        }}
      />
      {children}
    </div>
  );
}