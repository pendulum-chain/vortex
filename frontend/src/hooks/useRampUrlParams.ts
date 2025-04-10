import { useEffect } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { RampFormValues } from '../components/Nabla/schema';
import { FiatToken } from 'shared';

interface UseRampUrlParamsProps {
  form: UseFormReturn<RampFormValues, unknown, undefined>;
}

const defaultFiatTokenAmounts: Record<FiatToken, number> = { eurc: 20, ars: 20, brl: 5 };

export const useRampUrlParams = ({ form }: UseRampUrlParamsProps) => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inputAmountParam = params.get('fromAmount');
    const fiatToken = form.getValues('fiatToken');

    if (inputAmountParam) {
      const parsedAmount = Number(inputAmountParam);
      if (Number.isFinite(parsedAmount) && !isNaN(parsedAmount) && parsedAmount >= 0) {
        form.setValue('inputAmount', parsedAmount.toFixed(2));
      }
    } else if (fiatToken) {
      const defaultAmount = defaultFiatTokenAmounts[fiatToken as FiatToken];
      form.setValue('inputAmount', defaultAmount.toFixed(2));
    }
  }, [form]);
};
