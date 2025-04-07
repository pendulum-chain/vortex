import { useForm } from 'react-hook-form';

import { UseFormReturn } from 'react-hook-form';
import { SwapFormValues } from '../../components/Nabla/schema';
import { useFromAmount, usePixId, useRampFormStoreActions, useTaxId } from '../../stores/ramp/useRampFormStore';
import { useEffect, useRef } from 'react';
import Big from 'big.js';

export const useRampForm = (): {
  form: UseFormReturn<SwapFormValues>;
  reset: () => void;
} => {
  const form = useForm<SwapFormValues>({
    defaultValues: {
      fromAmount: '',
      toAmount: '',
      taxId: '',
      pixId: '',
    },
  });

  // Get store state and actions
  const taxId = useTaxId();
  const pixId = usePixId();
  const fromAmount = useFromAmount();
  const { setFromAmount, setTaxId, setPixId, reset: resetStore } = useRampFormStoreActions();

  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const subscription = form.watch((values, { name }) => {
      if (name === 'fromAmount' && values.fromAmount !== undefined) {
        setFromAmount(Big(values.fromAmount));
      } else if (name === 'taxId' && values.taxId !== undefined) {
        setTaxId(values.taxId);
      } else if (name === 'pixId' && values.pixId !== undefined) {
        setPixId(values.pixId);
      }
    });

    return () => subscription.unsubscribe();
  }, [form, setFromAmount, setTaxId, setPixId]);

  useEffect(() => {
    const currentFromAmount = form.getValues('fromAmount');
    if (fromAmount && !fromAmount.eq(Big(currentFromAmount))) {
      form.setValue('fromAmount', fromAmount.toString());
    }

    const currentTaxId = form.getValues('taxId');
    if (taxId && taxId !== currentTaxId) {
      form.setValue('taxId', taxId);
    }

    const currentPixId = form.getValues('pixId');
    if (pixId && pixId !== currentPixId) {
      form.setValue('pixId', pixId);
    }
  }, [form, taxId, pixId, fromAmount]);

  const reset = () => {
    form.reset({
      fromAmount: '',
      toAmount: '',
      taxId: '',
      pixId: '',
    });
    resetStore();
  };

  return {
    form,
    reset,
  };
};
