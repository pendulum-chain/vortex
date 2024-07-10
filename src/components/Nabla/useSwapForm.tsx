import Big from 'big.js';
import { Resolver, useForm, useWatch } from 'react-hook-form';
import { useState, useCallback, useMemo, useDeferredValue } from 'preact/compat';
import { yupResolver } from '@hookform/resolvers/yup';

import { TOKEN_CONFIG, TokenDetails, TokenType } from '../../constants/tokenConfig';
import { storageService } from '../../services/localStorage';
import { storageKeys } from '../../constants/localStorage';
import { debounce } from '../../helpers/function';
import schema, { SwapFormValues } from './schema';

export interface SwapSettings {
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
    return {
      from: storageValues?.from ?? 'usdc',
      to: storageValues?.to ?? 'brl',
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

  const fromToken = from ? TOKEN_CONFIG[from as TokenType] : undefined;
  const toToken = to ? TOKEN_CONFIG[to as TokenType] : undefined;

  const onFromChange = useCallback(
    (a: TokenDetails) => {
      const prev = getValues();
      const tokenKey = Object.keys(TOKEN_CONFIG).find(
        (key) => TOKEN_CONFIG[key as TokenType]!.assetCode === a.assetCode,
      );
      if (!tokenKey) return;

      const updated = {
        from: tokenKey,
        to: prev?.to === tokenKey ? prev?.from : prev?.to,
      };

      if (updated.to && prev?.to === tokenKey) setValue('to', updated.to);
      setStorageForSwapSettings(updated);
      setValue('from', tokenKey);

      setTokenModal(undefined);
    },
    [form, setValue, setTokenModal],
  );

  const onToChange = useCallback(
    (a: TokenDetails) => {
      const prev = getValues();
      const tokenKey = Object.keys(TOKEN_CONFIG).find(
        (key) => TOKEN_CONFIG[key as TokenType]!.assetCode === a.assetCode,
      );
      if (!tokenKey) return;

      const updated = {
        to: tokenKey,
        from: prev?.from === tokenKey ? prev?.to : prev?.from,
      };

      if (updated.from && prev?.from !== updated.from) setValue('from', updated.from);
      setStorageForSwapSettings(updated);
      setValue('to', tokenKey);

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
