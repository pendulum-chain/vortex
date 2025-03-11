import { useEffect } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { SwapFormValues } from '../../components/Nabla/schema';
import { FeeComparisonRef } from '../../components/FeeComparison';
import { OutputTokenType } from '../../constants/tokenConfig';

interface UseSwapUrlParamsProps {
  form: UseFormReturn<SwapFormValues, unknown, undefined>;
  feeComparisonRef: React.RefObject<FeeComparisonRef | null>;
}
const defaultFromAmounts: Record<OutputTokenType, number> = { eurc: 1000, ars: 200, brl: 300 };

export const useSwapUrlParams = ({ form, feeComparisonRef }: UseSwapUrlParamsProps) => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromAmountParam = params.get('fromAmount');
    const toTokenForm = form.getValues('to');

    if (fromAmountParam) {
      const parsedAmount = Number(fromAmountParam);
      if (!isNaN(parsedAmount) && parsedAmount >= 0) {
        form.setValue('fromAmount', parsedAmount.toFixed(2));
      }
    }

    if (toTokenForm) {
      const defaultAmount = defaultFromAmounts[toTokenForm];
      form.setValue('fromAmount', defaultAmount.toFixed(2));
    }
  }, [form, feeComparisonRef]);
};
