import { OnChainTokenDetails, OnChainTokenDetailsWithBalance } from "@packages/shared";
import { useMemo } from "react";
import { useOnchainTokenBalances } from "./useOnchainTokenBalances";

export const useOnchainTokenBalancesSorted = (tokens: OnChainTokenDetails[]): OnChainTokenDetailsWithBalance[] => {
  const tokenBalances = useOnchainTokenBalances(tokens);

  return useMemo(() => {
    // Sort by balance (highest to lowest), then by symbol (alphabetically)
    return [...tokenBalances].sort((a, b) => {
      const aBalance = parseFloat(a.balance);
      const bBalance = parseFloat(b.balance);

      // Primary sort: balance descending (highest to lowest)
      if (aBalance !== bBalance) {
        return bBalance - aBalance;
      }

      // Secondary sort: symbol ascending (alphabetically)
      return a.assetSymbol.localeCompare(b.assetSymbol);
    });
  }, [tokenBalances]);
};
