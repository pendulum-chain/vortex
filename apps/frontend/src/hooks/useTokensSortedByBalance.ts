import { getNetworkDisplayName, isOnChainTokenDetails, OnChainToken, OnChainTokenDetails } from "@packages/shared";
import { useMemo } from "react";
import { ExtendedTokenDefinition } from "../components/TokenSelection/TokenSelectionList/hooks/useTokenSelection";
import { useOnchainTokenBalancesSorted } from "./useOnchainTokenBalancesSorted";

/**
 * Type guard to check if a token definition is an ExtendedTokenDefinition
 */
function isExtendedTokenDefinition(token: unknown): token is ExtendedTokenDefinition {
  if (!token || typeof token !== "object" || token === null) {
    return false;
  }

  const obj = token as Record<string, unknown>;

  return (
    "assetSymbol" in obj &&
    "assetIcon" in obj &&
    "networkDisplayName" in obj &&
    "network" in obj &&
    "type" in obj &&
    "details" in obj &&
    typeof obj.assetSymbol === "string" &&
    typeof obj.assetIcon === "string" &&
    typeof obj.networkDisplayName === "string" &&
    obj.network !== null &&
    obj.network !== undefined &&
    obj.type !== null &&
    obj.type !== undefined &&
    obj.details !== null &&
    obj.details !== undefined &&
    typeof obj.details === "object"
  );
}

/**
 * Type guard to check if an array contains ExtendedTokenDefinition objects
 */
function isExtendedTokenDefinitionArray(
  tokenDefinitions: ExtendedTokenDefinition[] | OnChainTokenDetails[]
): tokenDefinitions is ExtendedTokenDefinition[] {
  return tokenDefinitions.length > 0 && isExtendedTokenDefinition(tokenDefinitions[0]);
}

export const useTokensSortedByBalance = (
  tokenDefinitions: ExtendedTokenDefinition[] | OnChainTokenDetails[]
): ExtendedTokenDefinition[] => {
  const onChainTokenDetails = useMemo(() => {
    if (isExtendedTokenDefinitionArray(tokenDefinitions)) {
      return tokenDefinitions
        .filter(token => token.details && isOnChainTokenDetails(token.details))
        .map(token => token.details as OnChainTokenDetails);
    } else {
      return tokenDefinitions;
    }
  }, [tokenDefinitions]);

  const sortedTokensWithBalances = useOnchainTokenBalancesSorted(onChainTokenDetails);

  const sortedTokenDefinitions = useMemo(() => {
    return sortedTokensWithBalances.map(details => ({
      assetIcon: details.networkAssetIcon,
      assetSymbol: details.assetSymbol,
      details: details,
      network: details.network,
      networkDisplayName: getNetworkDisplayName(details.network),
      type: details.assetSymbol as OnChainToken
    }));
  }, [sortedTokensWithBalances]);

  // Filter the sorted token definitions to match the original tokenDefinitions networks
  const filteredSortedTokenDefinitions = useMemo(() => {
    if (isExtendedTokenDefinitionArray(tokenDefinitions)) {
      // Create a set of unique network-token combinations from the original tokenDefinitions
      const allowedNetworkTokens = new Set(tokenDefinitions.map(token => `${token.network}-${token.assetSymbol}`));

      // Only include tokens that were in the original list
      return sortedTokenDefinitions.filter(token => allowedNetworkTokens.has(`${token.network}-${token.assetSymbol}`));
    }
    return sortedTokenDefinitions;
  }, [sortedTokenDefinitions, tokenDefinitions]);

  return filteredSortedTokenDefinitions as ExtendedTokenDefinition[];
};
