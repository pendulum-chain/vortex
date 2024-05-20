/* eslint-disable @typescript-eslint/no-explicit-any */

import { Abi } from '@polkadot/api-contract';
import { QueryKey, useQuery, UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'preact/compat';

import { defaultReadLimits, emptyCacheKey, QueryOptions } from '../../helpers/contracts';
import { config } from '../../config';
import { readMessage, ReadMessageResult } from '@pendulum-chain/api-solang';
import { ApiPromise } from '../../services/polkadot/polkadotApi';

const isDevelopment = config.isDev;
const ALICE = '6mfqoTMHrMeVMyKwjqomUjVomPMJ4AjdCm1VReFtk7Be8wqr';

export type MessageCallErrorResult = ReadMessageResult & { type: 'error' | 'panic' | 'reverted' };

export type UseContractReadProps<ReturnType> = {
  abi: Dict;
  address: string | undefined;
  method: string;
  args: any[];
  noWalletAddressRequired?: boolean;
  parseSuccessOutput: (successResult: any) => ReturnType;
  parseError: string | ((errorResult: MessageCallErrorResult) => string);
  queryOptions: QueryOptions<ReturnType | undefined, string>;
};

export type UseContractReadResult<ReturnType> = UseQueryResult<ReturnType | undefined, string>;

export function useContractRead<ReturnType>(
  key: QueryKey,
  api: ApiPromise,
  walletAddress: string,
  {
    abi,
    address,
    method,
    args,
    noWalletAddressRequired,
    queryOptions,
    parseSuccessOutput,
    parseError,
  }: UseContractReadProps<ReturnType>,
): UseContractReadResult<ReturnType> {

    const contractAbi = useMemo(
        () => (abi && api?.registry ? new Abi(abi, api.registry.getChainProperties()) : undefined),
        [abi, api?.registry],
    );

    const actualWalletAddress = noWalletAddressRequired === true ? ALICE : walletAddress;

    const enabled = !!contractAbi && queryOptions.enabled === true && !!address && !!api && !!actualWalletAddress;

    const queryKey = enabled ? key : emptyCacheKey;
    const queryFn = async () => {
        if (!enabled) return;
        const limits = defaultReadLimits;

        if (isDevelopment) {
            console.log('read', 'Call message', address, method, args);
        }

        let response: ReadMessageResult;

        response = await readMessage({
            abi: contractAbi,
            api,
            contractDeploymentAddress: address,
            callerAddress: actualWalletAddress,
            messageName: method,
            messageArguments: args || [],
            limits,
        });
        
        if (isDevelopment) {
            console.log('read', 'Call message result', address, method, args, response);
        }
        if (response.type !== 'success') {
            let message;
            if (typeof parseError === 'string') {
            message = parseError;
            } else {
            message = parseError(response as MessageCallErrorResult);
            }
            return Promise.reject(message);
        }

        return parseSuccessOutput(response.value);
    }

    const query = useQuery<ReturnType | undefined, string>({...queryOptions, queryKey, queryFn, enabled, retry: false})  

    return query;
    }