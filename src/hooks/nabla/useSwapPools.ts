import { UseQueryOptions, useQuery } from '@tanstack/react-query';
import request from 'graphql-request';
import { graphql } from '../../../gql/gql';
import { SwapPool } from '../../../gql/graphql';
import { cacheKeys, inactiveOptions } from '../../constants/cache';
import { emptyCacheKey, emptyFn } from '../../helpers/general';
import { useGetAppDataByTenant } from '../useGetAppDataByTenant';

export type UseSwapPoolsProps = UseQueryOptions<SwapPool[] | undefined>;

export const useSwapPools = (options?: UseSwapPoolsProps) => {
  const { indexerUrl } = useGetAppDataByTenant('nabla').data || {};
  const enabled = !!indexerUrl && options?.enabled !== false;
  return useQuery<SwapPool[] | undefined>(
    enabled ? [cacheKeys.swapPools, indexerUrl] : emptyCacheKey,
    enabled ? async () => (await request(indexerUrl, getSwapPools))?.swapPools as SwapPool[] : emptyFn,
    {
      ...inactiveOptions['1m'],
      refetchInterval: 30000,
      ...options,
      enabled,
    },
  );
};

export const getSwapPools = graphql(`
  query getSwapPools {
    swapPools {
      id
      liabilities
      paused
      reserves
      totalSupply
      token {
        id
        name
        symbol
        decimals
      }
      router {
        id
        paused
      }
      backstop {
        id
        liabilities
        paused
        reserves
        totalSupply
      }
    }
  }
`);
