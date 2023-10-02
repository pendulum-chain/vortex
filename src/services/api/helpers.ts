/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import type { ApiPromise } from '@polkadot/api';
import { ContractOptions } from '@polkadot/api-contract/types';
import { BN, BN_ONE } from '@polkadot/util';
import { emptyFn } from '../../helpers/general';

export const MAX_CALL_WEIGHT = new BN(5_000_000_000_0).isub(BN_ONE);
export const PROOFSIZE = new BN(1_000_000);

export type ApiArgs<T extends Dict<any> = [never]> = { api: ApiPromise } & T;

export const isApiConnected = (api?: ApiPromise): api is ApiPromise => !!api && api.isConnected;

export const fnOrEmpty =
  <T extends any[], R>(fn: (api: ApiPromise, ...args: T) => R) =>
  (api: ApiPromise | undefined, ...args: T): (() => R | undefined) =>
    isApiConnected(api) ? () => fn(api, ...args) : emptyFn;

// https://substrate.stackexchange.com/questions/6401/smart-contract-function-call-error/6402#6402
export const createReadOptions = (api: ApiPromise, opts?: ContractOptions) => ({
  gasLimit: api.createType('WeightV2', {
    refTime: 100000000000,
    proofSize: 1000000,
  }),
  storageDepositLimit: null,
  ...opts,
});
export const createWriteOptions = (api: ApiPromise, opts?: ContractOptions) => ({
  gasLimit: api.createType('WeightV2', {
    refTime: 18000000000,
    proofSize: 1750000,
  }),
  storageDepositLimit: null,
  ...opts,
});
