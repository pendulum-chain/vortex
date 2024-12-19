import { StateUpdater, useEffect } from 'preact/hooks';
import { UseFormReturn } from 'react-hook-form';
import { SwapFormValues } from '../../components/Nabla/schema';

interface UseSwapUrlParamsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<SwapFormValues, any, undefined>;
  setShowFeeCollapse: StateUpdater<boolean>;
}

export const useSwapUrlParams = ({ form, setShowFeeCollapse }: UseSwapUrlParamsProps) => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const fromAmountParam = params.get('fromAmount');
    if (fromAmountParam) {
      const parsedAmount = Number(fromAmountParam);
      if (!isNaN(parsedAmount)) {
        form.setValue('fromAmount', parsedAmount.toString());
      }
    }

    const showFeesParam = params.get('showFees');
    if (showFeesParam === 'true') {
      setShowFeeCollapse(true);
    }
  }, [form, setShowFeeCollapse]);
};
