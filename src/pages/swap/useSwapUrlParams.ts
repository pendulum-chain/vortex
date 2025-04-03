import { useEffect } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { SwapFormValues } from '../../components/Nabla/schema';
import { OutputTokenType } from '../../constants/tokenConfig';

interface UseSwapUrlParamsProps {
  form: UseFormReturn<SwapFormValues, unknown, undefined>;
}

const defaultFromAmounts: Record<OutputTokenType, number> = { eurc: 5, ars: 200, brl: 300 };

export const useSwapUrlParams = ({ form }: UseSwapUrlParamsProps) => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromAmountParam = params.get('fromAmount');
    const toTokenForm = form.getValues('to');

    if (fromAmountParam) {
      const parsedAmount = Number(fromAmountParam);
      if (!isNaN(parsedAmount) && parsedAmount >= 0) {
        form.setValue('fromAmount', parsedAmount.toFixed(2));
      }
    } else if (toTokenForm) {
      const defaultAmount = defaultFromAmounts[toTokenForm];
      form.setValue('fromAmount', defaultAmount.toFixed(2));
    }
  }, [form]);
};
