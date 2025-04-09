import { useForm, UseFormReturn } from 'react-hook-form';
import { useEffect } from 'react';
import Big from 'big.js';

import { RampFormValues } from '../../components/Nabla/schema';
import {
  DEFAULT_RAMP_FORM_STORE_VALUES,
  useFiatToken,
  useInputAmount,
  useOnChainToken,
  usePixId,
  useRampFormStoreActions,
  useTaxId,
} from '../../stores/ramp/useRampFormStore';

const DEFAULT_RAMP_FORM_VALUES: RampFormValues = {
  ...DEFAULT_RAMP_FORM_STORE_VALUES,
  inputAmount: '',
  outputAmount: undefined,
  deadline: 0,
  slippage: 0,
};

export const useRampForm = (): {
  form: UseFormReturn<RampFormValues>;
  reset: () => void;
} => {
  const form = useForm<RampFormValues>({
    defaultValues: DEFAULT_RAMP_FORM_VALUES,
  });

  const taxId = useTaxId();
  const pixId = usePixId();
  const inputAmount = useInputAmount();
  const onChainToken = useOnChainToken();
  const fiatToken = useFiatToken();

  const {
    setInputAmount,
    setOnChainToken,
    setFiatToken,
    setTaxId,
    setPixId,
    reset: resetStore,
  } = useRampFormStoreActions();

  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name === 'inputAmount' && values.inputAmount !== undefined) {
        setInputAmount(Big(values.inputAmount));
      } else if (name === 'taxId' && values.taxId !== undefined) {
        setTaxId(values.taxId);
      } else if (name === 'pixId' && values.pixId !== undefined) {
        setPixId(values.pixId);
      } else if (name === 'onChainToken' && values.onChainToken !== undefined) {
        setOnChainToken(values.onChainToken);
      } else if (name === 'fiatToken' && values.fiatToken !== undefined) {
        setFiatToken(values.fiatToken);
      }
    });

    return () => subscription.unsubscribe();
  }, [form, setInputAmount, setTaxId, setPixId, setOnChainToken, setFiatToken]);

  useEffect(() => {
    const currentInputAmount = form.getValues('inputAmount');
    if (inputAmount && !inputAmount.eq(Big(currentInputAmount || 0))) {
      form.setValue('inputAmount', inputAmount.toString());
    }

    const currentOnChainToken = form.getValues('onChainToken');
    if (onChainToken && onChainToken !== currentOnChainToken) {
      form.setValue('onChainToken', onChainToken);
    }

    const currentFiatToken = form.getValues('fiatToken');
    if (fiatToken && fiatToken !== currentFiatToken) {
      form.setValue('fiatToken', fiatToken);
    }

    const currentTaxId = form.getValues('taxId');
    if (taxId && taxId !== currentTaxId) {
      form.setValue('taxId', taxId);
    }

    const currentPixId = form.getValues('pixId');
    if (pixId && pixId !== currentPixId) {
      form.setValue('pixId', pixId);
    }
  }, [form, taxId, pixId, inputAmount, onChainToken, fiatToken]);

  const reset = () => {
    form.reset(DEFAULT_RAMP_FORM_VALUES);
    resetStore();
  };

  return {
    form,
    reset,
  };
};
