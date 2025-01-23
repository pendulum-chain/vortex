import { StateUpdater, useEffect } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { SwapFormValues } from '../../components/Nabla/schema';

interface UseSwapUrlParamsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<SwapFormValues, any, undefined>;
  setShowCompareFees: StateUpdater<boolean>;
}

export const useSwapUrlParams = ({ form, setShowCompareFees }: UseSwapUrlParamsProps) => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromAmountParam = params.get('fromAmount');
    if (fromAmountParam) {
      const parsedAmount = Number(fromAmountParam);
      if (!isNaN(parsedAmount) && parsedAmount >= 0) {
        form.setValue('fromAmount', parsedAmount.toFixed(2));
      }
    }

    const showCompareFeesParam = params.get('showCompareFees');
    if (showCompareFeesParam === 'true') {
      setShowCompareFees(true);
    }
  }, [form, setShowCompareFees]);
};
