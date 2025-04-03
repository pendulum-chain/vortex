import { yupResolver } from '@hookform/resolvers/yup';
import Big from 'big.js';
import { useMemo, useEffect } from 'react';
import { Resolver, useForm, useWatch } from 'react-hook-form';

import { SwapFormValues, useSchema } from './schema';
import { useFormStoreActions } from '../../stores/formStore';
import {
  useSwapFromToken,
  useSwapToToken,
  useSwapFromTokenDetails,
  useSwapToTokenDetails,
  useSwapModalActions,
  useSwapActions,
} from '../../pages/swap/swapStore';

export const useSwapForm = () => {
  const schema = useSchema();
  const { setFromAmount, setPixId, setTaxId } = useFormStoreActions();
  const { setFromAmountString } = useSwapActions();
  const { openTokenSelectModal } = useSwapModalActions();

  const from = useSwapFromToken();
  const to = useSwapToToken();
  const fromToken = useSwapFromTokenDetails();
  const toToken = useSwapToTokenDetails();

  const form = useForm<SwapFormValues>({
    resolver: yupResolver(schema) as Resolver<SwapFormValues>,
    defaultValues: {
      from,
      to,
      fromAmount: '',
      toAmount: '',
    },
  });

  const { control } = form;

  const fromAmountString = useWatch({
    control,
    name: 'fromAmount',
    defaultValue: '0',
  });

  const fromAmount: Big | undefined = useMemo(() => {
    try {
      const amount = new Big(fromAmountString);
      setFromAmount(amount);
      setFromAmountString(fromAmountString);
      return amount;
    } catch {
      return undefined;
    }
  }, [fromAmountString, setFromAmount, setFromAmountString]);

  const taxId = useWatch({ control, name: 'taxId' });
  const pixId = useWatch({ control, name: 'pixId' });

  useEffect(() => {
    if (!taxId) return;
    setTaxId(taxId);
  }, [taxId, setTaxId]);

  useEffect(() => {
    if (!pixId) return;
    setPixId(pixId);
  }, [pixId, setPixId]);

  return {
    form,
    from,
    to,
    openTokenSelectModal,
    fromAmount,
    fromAmountString,
    fromToken,
    toToken,
    reset: form.reset,
    taxId,
    pixId,
  };
};
