import { isOnChainTokenDetails, OnChainTokenDetails } from "@vortexfi/shared";
import { useMemo } from "react";
import { ExtendedTokenDefinition } from "../components/TokenSelection/TokenSelectionList/hooks/useTokenSelection";
import { useOnchainTokenBalancesSorted } from "./useOnchainTokenBalancesSorted";

function sortDefinitionsByBalanceOrder(
  definitions: ExtendedTokenDefinition[],
  balanceSortedDetails: OnChainTokenDetails[]
): ExtendedTokenDefinition[] {
  const sortOrderMap = new Map<string, number>();
  balanceSortedDetails.forEach((details, index) => {
    sortOrderMap.set(`${details.network}-${details.assetSymbol}`, index);
  });

  return [...definitions].sort((a, b) => {
    const keyA = `${a.network}-${a.assetSymbol}`;
    const keyB = `${b.network}-${b.assetSymbol}`;
    const orderA = sortOrderMap.get(keyA) ?? Number.MAX_SAFE_INTEGER;
    const orderB = sortOrderMap.get(keyB) ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });
}

export const useTokensSortedByBalance = (tokenDefinitions: ExtendedTokenDefinition[]): ExtendedTokenDefinition[] => {
  const onChainTokenDetails = useMemo(
    () =>
      tokenDefinitions
        .filter(token => token.details && isOnChainTokenDetails(token.details))
        .map(token => token.details as OnChainTokenDetails),
    [tokenDefinitions]
  );

  const sortedTokensWithBalances = useOnchainTokenBalancesSorted(onChainTokenDetails);

  return useMemo(
    () => sortDefinitionsByBalanceOrder(tokenDefinitions, sortedTokensWithBalances),
    [tokenDefinitions, sortedTokensWithBalances]
  );
};
