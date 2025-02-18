import { useEffect } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { SwapFormValues } from '../../components/Nabla/schema';
import { FeeComparisonRef } from '../../components/FeeComparison';
import { OutputTokenType } from '../../constants/tokenConfig';

interface UseSwapUrlParamsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<SwapFormValues, any, undefined>;
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

    const showCompareFeesParam = params.get('showCompareFees');
    if (showCompareFeesParam === 'true') {
      feeComparisonRef.current?.scrollIntoView();
      // toToken should always exist due to hardcoded default values. Defensive.
    } else if (toTokenForm) {
      const defaultAmount = defaultFromAmounts[toTokenForm];
      form.setValue('fromAmount', defaultAmount.toFixed(2));
    }
  }, [form, feeComparisonRef]);
};
