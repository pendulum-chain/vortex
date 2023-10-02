import { Abi } from '@polkadot/api-contract';
import { FrameSystemAccountInfo } from '@polkadot/types/lookup';
import { UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'preact/compat';
import { mockERC20 } from '../contracts/nabla/MockERC20';
import { useSharedState } from './Provider';
import { cacheKeys } from './constants';
import { QueryOptions } from './helpers';
import { nativeToDecimal, prettyNumbers } from './parseNumbers';
import { useContract } from './useContract';

export type UseBalanceProps<TAbi extends Abi> = {
  /** token or contract address */
  contractAddress?: string;
  /** account address */
  account?: string;
  /** contract abi */
  abi?: TAbi;
};
export type UseBalanceResponse = UseQueryResult<FrameSystemAccountInfo | undefined, unknown> & {
  balance?: number;
  formatted?: string;
  enabled: boolean;
};

export const useContractBalance = <TAbi extends Abi>(
  { contractAddress, account, abi }: UseBalanceProps<TAbi>,
  options?: QueryOptions,
): UseBalanceResponse => {
  const { api, address: defAddress } = useSharedState();
  const address = account || defAddress;

  const enabled = !!api && !!address && options?.enabled !== false;
  const query = useContract([cacheKeys.balance, contractAddress, address], {
    cacheTime: 180000,
    staleTime: 180000,
    retry: 2,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    ...options,
    abi: abi || mockERC20,
    address: contractAddress,
    owner: address,
    method: 'balanceOf',
    args: [address],
    enabled,
  });
  const { data } = query;
  const val = useMemo(() => {
    if (!data?.result?.isOk || data?.output === undefined) return undefined;
    const balance = nativeToDecimal(parseFloat(data.output.toString()) || 0).toNumber();
    return { balance, formatted: prettyNumbers(balance) };
  }, [data]);

  return {
    ...query,
    ...val,
  };
};
