/* eslint-disable @typescript-eslint/no-explicit-any */
import { executeMessage, ExecuteMessageResult } from '@pendulum-chain/api-solang';
import { Abi } from '@polkadot/api-contract';
import { MutationOptions, useMutation, UseMutationResult, UseMutationOptions } from '@tanstack/react-query';
import { useCallback, useMemo } from 'preact/compat';

import { defaultWriteLimits, createWriteOptions } from '../../helpers/contracts'

import { config } from '../../config';

import { getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { useGlobalState } from '../../GlobalStateProvider';

const isDevelopment = config.isDev;

export type UseContractWriteProps<TAbi extends Record<string, unknown>> = {
  abi: TAbi;
  address?: string;
  method: string;
  args?: any[];
  mutateOptions: Partial<MutationOptions<ExecuteMessageResult, ExecuteMessageResult, any[]>>;
};

export type UseContractWriteResponse = UseMutationResult<ExecuteMessageResult, ExecuteMessageResult, any[], unknown> & {
  isReady: boolean;
};

export async function useContractWrite<TAbi extends Record<string, unknown>>({
  abi,
  address,
  method,
  args,
  mutateOptions,
}: UseContractWriteProps<TAbi>): Promise<UseContractWriteResponse> {

    const apiManager = await getApiManagerInstance();
    // api should exist, otherwise error
     if (apiManager.apiData?.api) {
       throw new Error('API Error');
     }
     const api = apiManager.apiData!.api;
 
    const globalState = useGlobalState();

    const contractAbi = useMemo(
        () => (abi && api?.registry ? new Abi(abi, api.registry.getChainProperties()) : undefined),
        [abi, api?.registry],
    );

    const isReady = !!contractAbi && !!address && !!api && !!globalState.walletAccount?.address && !!globalState.walletAccount?.signer;
    const walletAddress = globalState.walletAccount?.address;
    const signer = globalState.walletAccount?.signer;

    const submit = useCallback(
        async (submitArgs?: any[]): Promise<ExecuteMessageResult> => {
        if (!isReady) throw 'Missing data';
        //setTransaction({ status: 'Pending' });
        const fnArgs = submitArgs || args || [];
        const contractOptions = createWriteOptions(api);

        if (isDevelopment) {
            console.log('write', 'call message write', address, method, args, submitArgs);
        }

        const response = await executeMessage({
            abi: contractAbi,
            api,
            callerAddress: walletAddress,
            contractDeploymentAddress: address,
            getSigner: () =>
            Promise.resolve({
                type: 'signer',
                address: walletAddress,
                signer,
            }),
            messageName: method,
            messageArguments: fnArgs,
            limits: { ...defaultWriteLimits, ...contractOptions },
            gasLimitTolerancePercentage: 10, // Allow 3 fold gas tolerance
        });

        if (isDevelopment) {
            console.log('write', 'call message write response', address, method, fnArgs, response);
        }

        if (response?.result?.type !== 'success') throw response;
        return response;
        },
        [address, api, args, contractAbi, isReady, method, signer, walletAddress],
    );

    const mutation = useMutation( {...mutateOptions, mutationFn: submit});
    return { ...mutation, isReady };
}