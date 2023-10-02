import { yupResolver } from '@hookform/resolvers/yup';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'preact/compat';
import { Resolver, useForm, useWatch } from 'react-hook-form';
import { Token } from '../../../gql/graphql';
import { useGlobalState } from '../../GlobalStateProvider';
import { config } from '../../config';
import { cacheKeys } from '../../constants/cache';
import { storageKeys } from '../../constants/localStorage';
import { routerAbi } from '../../contracts/nabla/Router';
import { calcPercentage } from '../../helpers/calc';
import { debounce } from '../../helpers/function';
import { useTokens } from '../../hooks/nabla/useTokens';
import { useGetAppDataByTenant } from '../../hooks/useGetAppDataByTenant';
import { SwapSettings } from '../../models/Swap';
import { storageService } from '../../services/storage/local';
import { decimalToNative } from '../../shared/parseNumbers';
import { useContractWrite } from '../../shared/useContractWrite';
import schema from './schema';
import { SwapFormValues } from './types';

export interface UseSwapComponentProps {
  from?: string;
  to?: string;
  onChange?: (from: string, to: string) => void;
}

export const defaultValues = config.swap.defaults;
const getInitialValues = () => ({
  ...defaultValues,
  ...storageService.getParsed<SwapSettings>(storageKeys.SWAP_SETTINGS),
});
const storageSet = debounce(storageService.set, 1000);

export const useSwapComponent = (props: UseSwapComponentProps) => {
  const { onChange } = props;
  const tokensQuery = useTokens();
  const { address } = useGlobalState().walletAccount || {};
  const hadMountedRef = useRef(false);
  const queryClient = useQueryClient();
  const { router } = useGetAppDataByTenant('nabla').data || {};
  const tokensModal = useState<undefined | 'from' | 'to'>();
  const setTokenModal = tokensModal[1];
  const storageState = useRef(getInitialValues());
  const initFrom = props.from || storageState.current.from;
  const initTo = props.to || storageState.current.to;
  const defaultFormValues = {
    ...storageState.current,
    from: initFrom || '',
    to: initTo || '',
  };
  const form = useForm<SwapFormValues>({
    resolver: yupResolver(schema) as Resolver<SwapFormValues>,
    defaultValues: defaultFormValues,
  });
  const { setValue, reset, getValues, control } = form;
  const from = useWatch({
    control,
    name: 'from',
  });

  const updateStorage = useCallback(
    (newValues: Partial<SwapSettings>) => {
      const prev = getValues();
      const updated = {
        slippage: prev.slippage || defaultValues.slippage,
        deadline: prev.deadline || defaultValues.deadline,
        ...newValues,
      };
      storageSet(storageKeys.SWAP_SETTINGS, updated);
      return updated;
    },
    [getValues],
  );

  const swapMutation = useContractWrite({
    abi: routerAbi, // ? should be chain specific
    address: router,
    method: 'swapExactTokensForTokens',
    onSuccess: () => {
      // update token balances
      queryClient.refetchQueries({ queryKey: [cacheKeys.walletBalance, getValues('from')], type: 'active' });
      queryClient.refetchQueries({ queryKey: [cacheKeys.walletBalance, getValues('to')], type: 'active' });
      // reset form
      reset();
    },
  });

  const onSubmit = form.handleSubmit((variables: SwapFormValues) => {
    const time = Math.floor(Date.now() / 1000) + variables.deadline;
    const deadline = decimalToNative(time);
    const slippage = variables.slippage ?? defaultValues.slippage;
    const fromAmount = decimalToNative(variables.fromAmount).toString();
    const toMinAmount = decimalToNative(calcPercentage(variables.toAmount, slippage)).toString();
    const spender = address;

    return swapMutation.mutate([spender, fromAmount, toMinAmount, [variables.from, variables.to], address, deadline]);
  });

  const onFromChange = useCallback(
    (a: string | Token, event = true) => {
      const f = typeof a === 'string' ? a : a.id;
      const prev = getValues();
      const updated = {
        from: f,
        to: prev?.to === f ? prev?.from : prev?.to,
      };
      updateStorage(updated);
      setValue('from', updated.from);
      if (updated.to && prev?.to === f) setValue('to', updated.to);
      if (onChange && event) onChange(updated.from, updated.to);
      setTokenModal(undefined);
    },
    [getValues, onChange, setTokenModal, setValue, updateStorage],
  );

  const onToChange = useCallback(
    (a: string | Token, event = true) => {
      const t = typeof a === 'string' ? a : a.id;
      const prev = getValues();
      const updated = {
        to: t,
        from: prev?.from === t ? prev?.to : prev?.from,
      };
      updateStorage(updated);
      if (updated.from && prev?.from !== updated.from) setValue('from', updated.from);
      setValue('to', updated.to);
      if (onChange && event) onChange(updated.from, updated.to);
      setTokenModal(undefined);
    },
    [getValues, onChange, setTokenModal, setValue, updateStorage],
  );

  const onReverse = useCallback(() => {
    const prev = getValues();
    if (prev.from) onToChange(prev.from);
    else if (prev.to) onFromChange(prev.to);
  }, [getValues, onFromChange, onToChange]);

  // when props change (url updated)
  useEffect(() => {
    if (hadMountedRef) {
      onFromChange(initFrom || '', false);
      onToChange(initTo || '', false);
    }
    hadMountedRef.current = true;
  }, [initFrom, initTo, onFromChange, onToChange]);

  return {
    form,
    tokensQuery,
    swapMutation,
    onSubmit,
    tokensModal,
    onFromChange,
    onToChange,
    onReverse,
    updateStorage,
    from,
    progressClose: () => {
      swapMutation.reset();
    },
  };
};
