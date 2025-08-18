import { OnChainTokenDetails, OnChainTokenDetailsWithBalance } from "@packages/shared";
import { sortBy } from "lodash";
import { useMemo } from "react";
import { useOnchainTokenBalances } from "./useOnchainTokenBalances";

export const useOnchainTokenBalancesSorted = (tokens: OnChainTokenDetails[]): OnChainTokenDetailsWithBalance[] => {
  const tokenBalances = useOnchainTokenBalances(tokens);

  return useMemo(() => {
    return sortBy(tokenBalances, [token => -parseFloat(token.balance), token => token.assetSymbol]);
  }, [tokenBalances]);
};
