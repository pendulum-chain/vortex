import { UseQueryOptions } from "@tanstack/react-query";

export const cacheKeys = {
  allPrices: "allPrices",
  fiatAccounts: "fiatAccounts"
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

export const activeOptions = {
  "1m": getOptions(true)(60000)
};
export const inactiveOptions = {
  "5m": getOptions(false)(300000)
};
