import { useState,  useCallback, useMemo } from 'react';

import { TOKEN_CONFIG, TokenDetails } from '../../constants/tokenConfig';

import { Resolver, useForm, useWatch } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { SwapFormValues } from './schema';
import schema from './schema';
import { storageService } from '../../services/localStorage';
import { getValidDeadline, getValidSlippage } from '../../helpers/transaction';
import { storageKeys } from '../../constants/localStorage';
import { config } from '../../config';
import { debounce } from '../../helpers/function';
import { PoolEntry } from './SelectionModal';
import { SwapSettings } from '.';
const storageSet = debounce(storageService.set, 1000);


export const useSwapForm = () => {

    const tokensModal = useState<undefined | 'from' | 'to'>();
    const setTokenModal = tokensModal[1];

    const initialState = useMemo(() => {
    const storageValues = storageService.getParsed<SwapSettings>(storageKeys.SWAP_SETTINGS);
    return {
        from:  storageValues?.from ?? '',
        to:  storageValues?.to ?? '',
        slippage: getValidSlippage(storageValues?.slippage),
        deadline: getValidDeadline(storageValues?.deadline ?? 0),
    };
    }, []);

    const form = useForm<SwapFormValues>({
    resolver: yupResolver(schema) as Resolver<SwapFormValues>,
    defaultValues: initialState,
    });

    const { setValue, getValues, control } = form;
    const from = useWatch({ control, name: 'from' });
    const to = useWatch({ control, name: 'to' });

    const fromToken = from?  TOKEN_CONFIG[from] : undefined;
    const toToken = to? TOKEN_CONFIG[to]: undefined;

    const updateStorage = useCallback(
        (newValues: Partial<SwapSettings>) => {
          const prev = form.getValues();
          const updated = {
            slippage: prev.slippage || config.swap.defaults.slippage,
            deadline: prev.deadline || config.swap.defaults.deadline,
            ...newValues,
          };
          storageSet(storageKeys.SWAP_SETTINGS, updated);
          return updated;
        },
        [form.getValues],
      );
    
    const onFromChange = useCallback(
    (a: TokenDetails | PoolEntry, event = true) => {
        const f = typeof a === 'string' ? a : a.assetCode;
        const prev = form.getValues();
        const tokenKey = Object.entries(TOKEN_CONFIG).filter(([key, tokenDetails])  => {
        return tokenDetails.assetCode === f;
        })[0][0];

        const updated = {
            from: tokenKey,
            to: prev?.to === tokenKey ? prev?.from : prev?.to,
        };

        if (updated.to && prev?.to === tokenKey) setValue('to', updated.to);
        updateStorage(updated);
        form.setValue('from', updated.from);

        setTokenModal(undefined);
    },
    [form.getValues, setTokenModal, form.setValue, updateStorage],
    );

    const onToChange = useCallback(
    (a: TokenDetails | PoolEntry, event = true) => {
        const f = typeof a === 'string' ? a : a.assetCode;
        const prev = form.getValues();
        const tokenKey = Object.entries(TOKEN_CONFIG).filter(([key, tokenDetails])  => {
        return tokenDetails.assetCode === f;
        })[0][0];
        const updated = {
        to: tokenKey,
        from: prev?.from === tokenKey ? prev?.to : prev?.from,
        };
        updateStorage(updated);
        if (updated.from && prev?.from !== updated.from) form.setValue('from', updated.from);
        form.setValue('to', updated.to);
        //setSecondSelectedAsset(tokenKey);
    },
    [form.getValues, setTokenModal, form.setValue, updateStorage],
    );

    // const resetSwapDestination = useCallback(() => {
    //     form.setValue('to', '');
    //     form.setValue('fromAmount', '0');

    //     const updated = {
    //         from: tokenKey,
    //         to: prev?.to === tokenKey ? prev?.from : prev?.to,
    //     };

    //     if (updated.to && prev?.to === tokenKey) setValue('to', updated.to);
    //     updateStorage(updated);
    // })

    const fromAmountString = useWatch({
        control,
        name: 'fromAmount',
        defaultValue: '0',
    });
    
    const slippage = getValidSlippage(
    Number(
        useWatch({
        control,
        name: 'slippage',
        defaultValue: config.swap.defaults.slippage,
        }),
    ),
    );

    const fromAmount = Number(fromAmountString);
    
    return {
        form,
        from,
        to,
        tokensModal,
        onFromChange,
        onToChange,
        updateStorage,
        fromAmount,
        fromToken,
        toToken,
        slippage
    }

}