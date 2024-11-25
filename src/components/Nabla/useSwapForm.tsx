import { yupResolver } from '@hookform/resolvers/yup';
import Big from 'big.js';
import { useCallback, useMemo, useState } from 'preact/compat';
import { Resolver, useForm, useWatch } from 'react-hook-form';

import { storageKeys } from '../../constants/localStorage';
import {
  getInputTokenDetails,
  InputTokenType,
  OutputTokenType,
  OUTPUT_TOKEN_CONFIG,
} from '../../constants/tokenConfig';
import { debounce } from '../../helpers/function';
import { storageService } from '../../services/storage/local';
import schema, { SwapFormValues } from './schema';
import { useNetwork } from '../../contexts/network';

interface SwapSettings {
  from: string;
  to: string;
}

const storageSet = debounce(storageService.set, 1000);
const setStorageForSwapSettings = storageSet.bind(null, storageKeys.SWAP_SETTINGS);

export const useSwapForm = () => {
  const tokensModal = useState<undefined | 'from' | 'to'>();
  const setTokenModal = tokensModal[1];
  const { selectedNetwork } = useNetwork();

  const initialState = useMemo(() => {
    const searchParams = new URLSearchParams(window.location.search);

    const defaultValues = { from: 'usdc', to: 'eurc' };
    const storageValues = storageService.getParsed<SwapSettings>(storageKeys.SWAP_SETTINGS);
    const searchParamValues = { from: searchParams.get('from'), to: searchParams.get('to') };

    const initialValues = {
      ...defaultValues,
      ...storageValues,
      ...searchParamValues,
    };

    const initialFromTokenIsValid = (() => {
      try {
        getInputTokenDetails(selectedNetwork, initialValues.from as InputTokenType);
        return true;
      } catch {
        return false;
      }
    })();
    const initialToTokenIsValid = OUTPUT_TOKEN_CONFIG[initialValues.to as OutputTokenType] !== undefined;

    const from = (initialFromTokenIsValid ? initialValues.from : defaultValues.from) as InputTokenType;
    const to = (initialToTokenIsValid ? initialValues.to : defaultValues.to) as OutputTokenType;

    return { from, to };
  }, [selectedNetwork]);

  const form = useForm<SwapFormValues>({
    resolver: yupResolver(schema) as Resolver<SwapFormValues>,
    defaultValues: initialState,
  });

  const { setValue, getValues, control } = form;
  const from = useWatch({ control, name: 'from' });
  const to = useWatch({ control, name: 'to' });

  const fromToken = from ? getInputTokenDetails(selectedNetwork, from) : undefined;
  const toToken = to ? OUTPUT_TOKEN_CONFIG[to] : undefined;

  const onFromChange = useCallback(
    (tokenKey: string) => {
      const prev = getValues();

      const updated = {
        from: tokenKey,
        to: prev?.to,
      };

      setStorageForSwapSettings(updated);
      setValue('from', tokenKey as InputTokenType);

      setTokenModal(undefined);
    },
    [getValues, setValue, setTokenModal],
  );

  const onToChange = useCallback(
    (tokenKey: string) => {
      const prev = getValues();
      if (!tokenKey) return;

      const updated = {
        to: tokenKey,
        from: prev?.from,
      };

      setStorageForSwapSettings(updated);
      setValue('to', tokenKey as OutputTokenType);

      setTokenModal(undefined);
    },
    [getValues, setTokenModal, setValue],
  );

  const fromAmountString = useWatch({
    control,
    name: 'fromAmount',
    defaultValue: '0',
  });

  let fromAmount: Big | undefined;
  try {
    fromAmount = new Big(fromAmountString);
  } catch {
    // no action required
  }

  return {
    form,
    from,
    to,
    tokensModal,
    onFromChange,
    onToChange,
    fromAmount,
    fromAmountString,
    fromToken,
    toToken,
    reset: form.reset,
  };
};
