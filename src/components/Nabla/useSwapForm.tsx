import { yupResolver } from '@hookform/resolvers/yup';
import Big from 'big.js';
import { useCallback, useMemo, useState, useEffect } from 'react';
import { Resolver, useForm, useWatch } from 'react-hook-form';

import { storageKeys } from '../../constants/localStorage';
import {
  getBaseOutputTokenDetails,
  getInputTokenDetails,
  InputTokenType,
  OutputTokenType,
} from '../../constants/tokenConfig';
import { debounce } from '../../helpers/function';
import { storageService } from '../../services/storage/local';
import { SwapFormValues, useSchema } from './schema';
import { getCaseSensitiveNetwork } from '../../helpers/networks';
import { useNetwork } from '../../contexts/network';
import { useFormStoreActions } from '../../stores/formStore';

type SwapSettings = {
  from: string;
  to: string;
};

type TokenSelectType = 'from' | 'to';

const storageSet = debounce(storageService.set, 1000);
const setStorageForSwapSettings = storageSet.bind(null, storageKeys.SWAP_SETTINGS);

function mergeIfDefined<T>(target: T, source: T | undefined): void {
  if (!source) return;

  Object.entries(source).forEach(([key, value]) => {
    if (value != null) {
      target[key as keyof T] = value as T[keyof T];
    }
  });
}

export const useSwapForm = () => {
  const [isTokenSelectModalVisible, setIsTokenSelectModalVisible] = useState(false);
  const [tokenSelectModalType, setTokenModalType] = useState<TokenSelectType>('from');
  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const { setFromAmount, setPixId, setTaxId } = useFormStoreActions();
  const schema = useSchema();

  const initialState = useMemo(() => {
    const searchParams = new URLSearchParams(window.location.search);

    const defaultValues = { from: 'usdc', to: 'eurc', network: selectedNetwork };
    const storageValues = storageService.getParsed<SwapSettings>(storageKeys.SWAP_SETTINGS);
    const searchParamValues = {
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      network: searchParams.get('network'),
    };

    const initialValues = {
      ...defaultValues,
    };
    mergeIfDefined(initialValues, storageValues);
    mergeIfDefined(initialValues, searchParamValues);

    const network = getCaseSensitiveNetwork(initialValues.network);
    if (network !== selectedNetwork) {
      setSelectedNetwork(network, true);
    }

    const initialFromToken = getInputTokenDetails(network, initialValues.from as InputTokenType);
    const initialFromTokenIsValid = initialFromToken !== undefined;
    const initialToTokenIsValid = getBaseOutputTokenDetails(initialValues.to as OutputTokenType);

    const from = (initialFromTokenIsValid ? initialValues.from : defaultValues.from) as InputTokenType;
    const to = (initialToTokenIsValid ? initialValues.to : defaultValues.to) as OutputTokenType;

    return { from, to };
  }, [selectedNetwork, setSelectedNetwork]);

  const form = useForm<SwapFormValues>({
    resolver: yupResolver(schema) as Resolver<SwapFormValues>,
    defaultValues: initialState,
  });

  const { setValue, getValues, control } = form;
  const from = useWatch({ control, name: 'from' });
  const to = useWatch({ control, name: 'to' });

  const fromToken = useMemo(
    () => (from ? getInputTokenDetails(selectedNetwork, from) : undefined),
    [from, selectedNetwork],
  );
  const toToken = useMemo(() => (to ? getBaseOutputTokenDetails(to) : undefined), [to]);

  const onFromChange = useCallback(
    (tokenKey: string) => {
      const prev = getValues();

      const updated: SwapSettings = {
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

      const updated: SwapSettings = {
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
      const fromAmount = new Big(fromAmountString);
      setFromAmount(fromAmount);
      return fromAmount;
    } catch {
      return undefined;
    }
  }, [fromAmountString, setFromAmount]);

  const openTokenSelectModal = useCallback((type: TokenSelectType) => {
    setTokenModalType(type);
    setIsTokenSelectModalVisible(true);
  }, []);

  const closeTokenSelectModal = useCallback(() => {
    setIsTokenSelectModalVisible(false);
  }, []);

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
    taxId,
    pixId,
  };
};
