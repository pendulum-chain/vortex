import { UseQueryOptions } from "@tanstack/react-query";

export const cacheKeys = {
  accountBalance: "accountBalance",
  allPrices: "allPrices",
  balance: "balance",
  nablaInstance: "nablaInstance",
  quoteBackstopPoolDrain: "quoteBackstopPoolDrain",
  quoteBackstopPoolWithdraw: "quoteBackstopPoolWithdraw",
  quoteSwapPoolRedeem: "quoteSwapPoolRedeem",
  quoteSwapPoolWithdraw: "quoteSwapPoolWithdraw",
  sharesTargetWorth: "sharesTargetWorth",
  tokenAllowance: "tokenAllowance",
  tokenOutAmount: "tokenOutAmount",
  tokenPrice: "tokenPrice",
  tokens: "tokens",
  walletBalance: "walletBalance"
};

type QueryOptions<TData = unknown, TError = Error> = Partial<
  Omit<UseQueryOptions<TData, TError, TData, readonly unknown[]>, "queryKey" | "queryFn">
>;

const getOptions =
  <TData = unknown, TError = Error>(active: boolean) =>
  (time: number): QueryOptions<TData, TError> => ({
    refetchOnReconnect: active,
    refetchOnWindowFocus: active,
    retry: 2,
    staleTime: time
  });

export const getActiveOptions = getOptions(true);
export const activeOptions = {
  "0": getActiveOptions(0),
  "1h": getActiveOptions(3600000),
  "1m": getActiveOptions(60000),
  "3m": getActiveOptions(180000),
  "3s": getActiveOptions(3000),
  "5m": getActiveOptions(300000),
  "15m": getActiveOptions(900000),
  "15s": getActiveOptions(15000),
  "30s": getActiveOptions(30000)
};
export const getInactiveOptions = getOptions(false);
export const inactiveOptions = {
  "0": getInactiveOptions(0),
  "1h": getInactiveOptions(3600000),
  "1m": getInactiveOptions(60000),
  "3m": getInactiveOptions(180000),
  "3s": getInactiveOptions(3000),
  "5m": getInactiveOptions(300000),
  "15m": getInactiveOptions(900000),
  "15s": getInactiveOptions(15000),
  "30s": getInactiveOptions(30000)
};
