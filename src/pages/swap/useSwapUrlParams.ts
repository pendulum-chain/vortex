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
const defaultAmounts: Record<OutputTokenType, number> = { eurc: 1000, ars: 200 };

export const useSwapUrlParams = ({ form, setShowCompareFees }: UseSwapUrlParamsProps) => {
  const { address } = useVortexAccount();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromAmountParam = params.get('fromAmount');
    const toToken = params.get('to');
    const toTokenForm = form.getValues('to');

    // const newurl = window.location.protocol + "//" + window.location.host;
    // window.history.pushState({path:newurl},'',newurl);

    if (fromAmountParam) {
      const parsedAmount = Number(fromAmountParam);
      if (!isNaN(parsedAmount) && parsedAmount >= 0) {
        form.setValue('fromAmount', parsedAmount.toFixed(2));
      }
    } //less invasive -> else if (defaultAmounts[toToken as OutputTokenType] && !address) {
    else if (toTokenForm) {
      const defaultAmount = defaultAmounts[toTokenForm];
      form.setValue('fromAmount', defaultAmount.toFixed(2));
    }
    setShowCompareFees(true);
    // const showCompareFeesParam = params.get('showCompareFees');
    // if (showCompareFeesParam === 'true') {
    //   setShowCompareFees(true);
    // }
  }, [form, setShowCompareFees]);
};
