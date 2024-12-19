import { StateUpdater, useEffect } from 'preact/hooks';
import { UseFormReturn } from 'react-hook-form';
import { SwapFormValues } from '../../components/Nabla/schema';

interface UseSwapUrlParamsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<SwapFormValues, any, undefined>;
  setShowFeeCollapse: StateUpdater<boolean>;
  setShowCompareFees: StateUpdater<boolean>;
}

export const useSwapUrlParams = ({ form, setShowFeeCollapse, setShowCompareFees }: UseSwapUrlParamsProps) => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromAmountParam = params.get('fromAmount');
    if (fromAmountParam) {
      const parsedAmount = Number(fromAmountParam);
      if (!isNaN(parsedAmount) && parsedAmount >= 0) {
        form.setValue('fromAmount', parsedAmount.toFixed(2));
      }
    }

    const showFeesParam = params.get('showFees');
    if (showFeesParam === 'true') {
      setShowFeeCollapse(true);
    }

    const showCompareFeesParam = params.get('showCompareFees');
    if (showCompareFeesParam === 'true') {
      setShowCompareFees(true);
    }
  }, [form, setShowFeeCollapse, setShowCompareFees]);
};
