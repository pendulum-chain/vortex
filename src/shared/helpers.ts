import { ApiPromise } from '@polkadot/api';
import { SubmittableResultValue } from '@polkadot/api-base/types';
import type { QueryKey, UseQueryOptions } from '@tanstack/react-query';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryOptions<TFnData = any, TError = any, TData = any> = Partial<
  Omit<UseQueryOptions<TFnData, TError, TData, QueryKey>, 'queryKey' | 'queryFn'>
>;

export const emptyFn = () => undefined;
export const emptyCacheKey = [''];

// TODO: complete
export const parseTransactionError = (result: SubmittableResultValue | undefined, api: ApiPromise) => {
  if (!result?.dispatchError) return undefined;
  if (result.dispatchError.isModule) {
    // for module errors, we have the section indexed, lookup
    const decoded = api.registry.findMetaError(result.dispatchError.asModule);
    const { docs, name, section } = decoded;
    console.log(`${section}.${name}: ${docs.join(' ')}`);
  } else {
    // Other, CannotLookup, BadOrigin, no extra info
    console.log(result.dispatchError.toString());
  }
};
