import { OnChainTokenDetails, OnChainTokenDetailsWithBalance } from "@vortexfi/shared";
import { useMemo } from "react";
import { useOnchainTokenBalances } from "./useOnchainTokenBalances";

export const useOnchainTokenBalancesSorted = (tokens: OnChainTokenDetails[]): OnChainTokenDetailsWithBalance[] => {
  const tokenBalances = useOnchainTokenBalances(tokens);

  return useMemo(() => {
    // Sort by balance (highest to lowest), then by symbol (alphabetically)
    return [...tokenBalances].sort((a, b) => {
      const aBalance = parseFloat(a.balanceUsd ?? "0");
      const bBalance = parseFloat(b.balanceUsd ?? "0");

      // Primary sort: balance descending (highest to lowest)
      if (aBalance !== bBalance) {
        return bBalance - aBalance;
      }

      // Tie-breaker: sort by symbol alphabetically
      return a.assetSymbol.localeCompare(b.assetSymbol);
    });
  }, [tokenBalances]);
};
