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
  const [isTokenSelectModalVisible, setIsTokenSelectModalVisible] = useState(false);
  const [tokenSelectModalType, setTokenModalType] = useState<'from' | 'to'>('from');

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

    const initialFromTokenIsValid = INPUT_TOKEN_CONFIG[initialValues.from as InputTokenType] !== undefined;
    const initialToTokenIsValid = OUTPUT_TOKEN_CONFIG[initialValues.to as OutputTokenType] !== undefined;

    const from = (initialFromTokenIsValid ? initialValues.from : defaultValues.from) as InputTokenType;
    const to = (initialToTokenIsValid ? initialValues.to : defaultValues.to) as OutputTokenType;

    return { from, to };
  }, []);

  const form = useForm<SwapFormValues>({
    resolver: yupResolver(schema) as Resolver<SwapFormValues>,
    defaultValues: initialState,
  });

  const { setValue, getValues, control } = form;
  const from = useWatch({ control, name: 'from' });
  const to = useWatch({ control, name: 'to' });

  const fromToken = useMemo(() => (from ? INPUT_TOKEN_CONFIG[from] : undefined), [from]);
  const toToken = useMemo(() => (to ? OUTPUT_TOKEN_CONFIG[to] : undefined), [to]);

  const onFromChange = useCallback(
    (tokenKey: string) => {
      const prev = getValues();

      const updated = {
        from: tokenKey,
        to: prev?.to,
      };

      setStorageForSwapSettings(updated);
      setValue('from', tokenKey as InputTokenType);

      setIsTokenSelectModalVisible(false);
    },
    [getValues, setValue],
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

      setIsTokenSelectModalVisible(false);
    },
    [getValues, setValue],
  );

  const fromAmountString = useWatch({
    control,
    name: 'fromAmount',
    defaultValue: '0',
  });

  const fromAmount: Big | undefined = useMemo(() => {
    try {
      return new Big(fromAmountString);
    } catch {
      return undefined;
    }
  }, [fromAmountString]);

  const openTokenSelectModal = useCallback((type: 'from' | 'to') => {
    setTokenModalType(type);
    setIsTokenSelectModalVisible(true);
  }, []);

  const closeTokenSelectModal = useCallback(() => {
    setIsTokenSelectModalVisible(false);
  }, []);

  return {
    form,
    from,
    to,
    isTokenSelectModalVisible,
    tokenSelectModalType,
    openTokenSelectModal,
    closeTokenSelectModal,
    onFromChange,
    onToChange,
    fromAmount,
    fromAmountString,
    fromToken,
    toToken,
    reset: form.reset,
  };
};
