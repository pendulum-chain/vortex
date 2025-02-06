import { Dispatch, SetStateAction, useEffect } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { SwapFormValues } from '../../components/Nabla/schema';
import { OutputTokenType } from '../../constants/tokenConfig';
import { useVortexAccount } from '../../hooks/useVortexAccount';

interface UseSwapUrlParamsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<SwapFormValues, any, undefined>;
  setShowCompareFees: Dispatch<SetStateAction<boolean>>;
}
const defaultFromAmounts: Record<OutputTokenType, number> = { eurc: 1000, ars: 200 };

export const useSwapUrlParams = ({ form, setShowCompareFees }: UseSwapUrlParamsProps) => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromAmountParam = params.get('fromAmount');
    const toTokenForm = form.getValues('to');

    if (fromAmountParam) {
      const parsedAmount = Number(fromAmountParam);
      if (!isNaN(parsedAmount) && parsedAmount >= 0) {
        form.setValue('fromAmount', parsedAmount.toFixed(2));
      }
      setShowCompareFees(true);
      // toToken should always exist due to hardcoded default values. Defensive.
    } else if (toTokenForm) {
      const defaultAmount = defaultFromAmounts[toTokenForm];
      form.setValue('fromAmount', defaultAmount.toFixed(2));
      setShowCompareFees(true);
    }
  }, [form, setShowCompareFees]);
};
