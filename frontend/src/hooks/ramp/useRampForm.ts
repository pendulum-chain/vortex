import { useForm, UseFormReturn } from 'react-hook-form';
import { useEffect, useCallback } from 'react';
import { FiatToken } from 'shared';
import { yupResolver } from '@hookform/resolvers/yup';

import { RampFormValues, useSchema } from './schema';
import {
  DEFAULT_RAMP_FORM_STORE_VALUES,
  useFiatToken,
  useInputAmount,
  useOnChainToken,
  usePixId,
  useRampFormStoreActions,
  useTaxId,
} from '../../stores/ramp/useRampFormStore';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { RampDirection } from '../../components/RampToggle';

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
  const formSchema = useSchema();

  const form = useForm<RampFormValues>({
    resolver: yupResolver(formSchema),
    defaultValues: DEFAULT_RAMP_FORM_VALUES,
  });

  console.log('form', form.formState.errors);

  const taxId = useTaxId();
  const pixId = usePixId();
  const inputAmount = useInputAmount();
  const onChainToken = useOnChainToken();
  const fiatToken = useFiatToken();
  const direction = useRampDirection();

  const {
    setInputAmount,
    setOnChainToken,
    setFiatToken,
    setTaxId,
    setPixId,
    reset: resetStore,
  } = useRampFormStoreActions();

  const enforceTokenConstraints = useCallback(
    (token: FiatToken): FiatToken => {
      // For onramp, we only allow BRL
      if (direction === RampDirection.ONRAMP && token !== FiatToken.BRL) {
        return FiatToken.BRL;
      }
      return token;
    },
    [direction],
  );

  useEffect(() => {
    const constrainedToken = enforceTokenConstraints(fiatToken);
    if (constrainedToken !== fiatToken) {
      setFiatToken(constrainedToken);
    }
  }, [direction, fiatToken, setFiatToken, enforceTokenConstraints]);

  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name === 'inputAmount' && values.inputAmount !== undefined) {
        setInputAmount(values.inputAmount || '0');
      } else if (name === 'taxId' && values.taxId !== undefined) {
        setTaxId(values.taxId);
      } else if (name === 'pixId' && values.pixId !== undefined) {
        setPixId(values.pixId);
      } else if (name === 'onChainToken' && values.onChainToken !== undefined) {
        setOnChainToken(values.onChainToken);
      } else if (name === 'fiatToken' && values.fiatToken !== undefined) {
        const constrainedToken = enforceTokenConstraints(values.fiatToken);

        if (constrainedToken !== values.fiatToken) {
          form.setValue('fiatToken', constrainedToken);
        }

        setFiatToken(constrainedToken);
      }
    });

    return () => subscription.unsubscribe();
  }, [form, setInputAmount, setTaxId, setPixId, setOnChainToken, setFiatToken, enforceTokenConstraints]);

  useEffect(() => {
    const currentInputAmount = form.getValues('inputAmount');
    const storeInputAmountStr = inputAmount?.toString() || '0';
    if (storeInputAmountStr !== '0' && currentInputAmount !== storeInputAmountStr) {
      form.setValue('inputAmount', storeInputAmountStr);
    }

    const currentOnChainToken = form.getValues('onChainToken');
    if (onChainToken && onChainToken !== currentOnChainToken) {
      form.setValue('onChainToken', onChainToken);
    }

    const currentFiatToken = form.getValues('fiatToken');
    const constrainedToken = enforceTokenConstraints(fiatToken);

    if (constrainedToken !== currentFiatToken) {
      form.setValue('fiatToken', constrainedToken);
    }

    const currentTaxId = form.getValues('taxId');
    if (taxId !== currentTaxId) {
      form.setValue('taxId', taxId || '');
    }

    const currentPixId = form.getValues('pixId');
    if (pixId !== currentPixId) {
      form.setValue('pixId', pixId || '');
    }
  }, [form, taxId, pixId, inputAmount, onChainToken, fiatToken, enforceTokenConstraints]);

  const reset = () => {
    resetStore();
    form.reset(DEFAULT_RAMP_FORM_VALUES);
  };

  return {
    form,
    reset,
  };
};
