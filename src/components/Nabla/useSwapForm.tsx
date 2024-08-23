import { yupResolver } from '@hookform/resolvers/yup';
import Big from 'big.js';
import { useCallback, useMemo, useState } from 'preact/compat';
import { Resolver, useForm, useWatch } from 'react-hook-form';

import { storageKeys } from '../../constants/localStorage';
import { INPUT_TOKEN_CONFIG, InputTokenType, OUTPUT_TOKEN_CONFIG, OutputTokenType } from '../../constants/tokenConfig';
import { debounce } from '../../helpers/function';
import { storageService } from '../../services/storage/local';
import schema, { SwapFormValues } from './schema';

interface SwapSettings {
  from: string;
  to: string;
}

const storageSet = debounce(storageService.set, 1000);
const setStorageForSwapSettings = storageSet.bind(null, storageKeys.SWAP_SETTINGS);

export const useSwapForm = () => {
  const tokensModal = useState<undefined | 'from' | 'to'>();
  const setTokenModal = tokensModal[1];

  const initialState = useMemo(() => {
    const storageValues = storageService.getParsed<SwapSettings>(storageKeys.SWAP_SETTINGS);

    const storedFromTokenIsValid = INPUT_TOKEN_CONFIG[storageValues?.from as InputTokenType] !== undefined;
    const storedToTokenIsValid = OUTPUT_TOKEN_CONFIG[storageValues?.to as OutputTokenType] !== undefined;

    return {
      from: (storedFromTokenIsValid ? storageValues?.from : 'usdc') as InputTokenType,
      to: (storedToTokenIsValid ? storageValues?.to : 'eurc') as OutputTokenType,
      taxNumber: '',
      bankAccount: '',
    };
  }, []);

  const form = useForm<SwapFormValues>({
    resolver: yupResolver(schema) as Resolver<SwapFormValues>,
    defaultValues: initialState,
  });

  const { setValue, getValues, control } = form;
  const from = useWatch({ control, name: 'from' });
  const to = useWatch({ control, name: 'to' });

  const fromToken = from ? INPUT_TOKEN_CONFIG[from] : undefined;
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
