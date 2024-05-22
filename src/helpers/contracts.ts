import { INumber } from '@polkadot/types-codec/types';
import BigNumber from 'bn.js';
import {customToDecimal} from './parseNumbers';
import { Limits } from '@pendulum-chain/api-solang';
import type { QueryKey, UseQueryOptions } from '@tanstack/react-query';
import type { ApiPromise } from '@polkadot/api';
import { ContractOptions } from '@polkadot/api-contract/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryOptions<TFnData = any, TError = any, TData = TFnData> = Omit<
  UseQueryOptions<TFnData, TError, TData, QueryKey>,
  'queryKey' | 'queryFn'
>;
export const emptyCacheKey = [''];

export const defaultReadLimits: Limits = {
  gas: {
    refTime: '10000000000000000',
    proofSize: '10000000000000000',
  },
  storageDeposit: undefined,
};

export const defaultWriteLimits: Limits = {
  gas: {
    refTime: '10000000000000',
    proofSize: '10000000000',
  },
  storageDeposit: undefined,
};

export const createWriteOptions = (api: ApiPromise, opts?: ContractOptions) => ({
  gasLimit: api.createType('WeightV2', {
    refTime: '18000000000',
    proofSize: '1750000',
  }),
  storageDepositLimit: null,
  ...opts,
});

export interface ContractBalance {
  decimals: number;
  preciseBigDecimal: BigNumber;
  preciseString: string;
  approximateStrings: {
    atLeast2Decimals: string;
    atLeast4Decimals: string;
  };
  approximateNumber: number;
}

export function parseContractBalanceResponse(decimals: number, balanceResponse: INumber): ContractBalance;

export function parseContractBalanceResponse(
  decimals: number | undefined,
  balanceResponse: INumber | undefined,
): ContractBalance | undefined;

export function parseContractBalanceResponse(
  decimals: number | undefined,
  balanceResponse: INumber | undefined,
): ContractBalance | undefined {
  const rawBalanceBigInt = balanceResponse?.toBigInt();
  if (rawBalanceBigInt === undefined || decimals === undefined) return undefined;

  const rawBalanceString = rawBalanceBigInt.toString();
  const preciseDecimal = customToDecimal(rawBalanceString, decimals);
    //   const atLeast2Decimals = stringifyBigWithSignificantDecimals(preciseBigDecimal, 2);
    //   const atLeast4Decimals = stringifyBigWithSignificantDecimals(preciseBigDecimal, 4);
    // simplified for now, just return the full string
  const atLeast2Decimals = preciseDecimal.toString();
  const atLeast4Decimals = preciseDecimal.toString();

  // TODO improve the names, given the change of big decimal library
  return {  
    decimals,
    preciseBigDecimal: new BigNumber(rawBalanceString),
    preciseString: preciseDecimal.toString(),
    approximateStrings: {
      atLeast2Decimals,
      atLeast4Decimals,
    },
    approximateNumber: preciseDecimal,
  };
}

