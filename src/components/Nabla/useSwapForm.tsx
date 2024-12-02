import { yupResolver } from '@hookform/resolvers/yup';
import Big from 'big.js';
import { useCallback, useMemo, useState } from 'preact/compat';
import { Resolver, useForm, useWatch } from 'react-hook-form';

import { storageKeys } from '../../constants/localStorage';
import {
  getInputTokenDetails,
  InputTokenType,
  OUTPUT_TOKEN_CONFIG,
  OutputTokenType,
} from '../../constants/tokenConfig';
import { debounce } from '../../helpers/function';
import { storageService } from '../../services/storage/local';
import schema, { SwapFormValues } from './schema';
import { Networks, useNetwork } from '../../contexts/network';

interface SwapSettings {
  from: string;
  to: string;
}

const storageSet = debounce(storageService.set, 1000);
const setStorageForSwapSettings = storageSet.bind(null, storageKeys.SWAP_SETTINGS);

function getCaseSensitiveNetwork(network: string): Networks {
  if (network.toLowerCase() === 'assethub') {
    return Networks.AssetHub;
  } else if (network.toLowerCase() === 'polygon') {
    return Networks.Polygon;
  } else {
    console.warn('Invalid network type');
    return Networks.AssetHub;
  }
}

// Helper function to merge values if they are defined
function mergeIfDefined(target: any, source: any) {
  for (const key in source) {
    if (source[key] !== undefined && source[key] !== null) {
      target[key] = source[key];
    }
  }
}

export const useSwapForm = () => {
  const [isTokenSelectModalVisible, setIsTokenSelectModalVisible] = useState(false);
  const [tokenSelectModalType, setTokenModalType] = useState<'from' | 'to'>('from');
  const { selectedNetwork, setSelectedNetwork } = useNetwork();

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
      setSelectedNetwork(network);
    }

    const initialFromToken = getInputTokenDetails(network, initialValues.from as InputTokenType);
    const initialFromTokenIsValid = initialFromToken !== getInputTokenDetails(network, 'usdc');
    const initialToTokenIsValid = OUTPUT_TOKEN_CONFIG[initialValues.to as OutputTokenType] !== undefined;

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
