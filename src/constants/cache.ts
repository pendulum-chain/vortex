import { UseQueryOptions } from '@tanstack/react-query';

export const cacheKeys = {
  assets: 'assets',
  backstopPools: 'backstopPools',
  swapData: 'swapData',
  swapPools: 'swapPools',
  tokens: 'tokens',
  tokenAllowance: 'tokenAllowance',
  balance: 'balance',
  walletBalance: 'walletBalance',
  walletBalances: 'walletBalances',
};

export type QueryOptions = Partial<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Omit<UseQueryOptions<any, any, any, any>, 'queryKey' | 'queryFn'>
>;

const getOptions =
  (active: boolean) =>
  (time: number): QueryOptions => ({
    cacheTime: time,
    staleTime: time,
    retry: 2,
    refetchOnReconnect: active,
    refetchOnWindowFocus: active,
  });

export const getActiveOptions = getOptions(true);
export const activeOptions = {
  '1h': getActiveOptions(3600000),
  '15m': getActiveOptions(900000),
  '5m': getActiveOptions(300000),
  '3m': getActiveOptions(180000),
  '1m': getActiveOptions(60000),
  '30s': getActiveOptions(30000),
  '15s': getActiveOptions(15000),
  '3s': getActiveOptions(3000),
  '0': getActiveOptions(0),
};
export const getInactiveOptions = getOptions(false);
export const inactiveOptions = {
  '1h': getInactiveOptions(3600000),
  '15m': getInactiveOptions(900000),
  '5m': getInactiveOptions(300000),
  '3m': getInactiveOptions(180000),
  '1m': getInactiveOptions(60000),
  '30s': getInactiveOptions(30000),
  '15s': getInactiveOptions(15000),
  '3s': getInactiveOptions(3000),
  '0': getInactiveOptions(0),
};
