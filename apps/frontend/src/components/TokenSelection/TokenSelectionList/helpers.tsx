import {
  assetHubTokenConfig,
  doesNetworkSupportRamp,
  EvmNetworks,
  evmTokenConfig,
  FiatToken,
  FiatTokenDetails,
  getEnumKeyByStringValue,
  getNetworkDisplayName,
  isNetworkEVM,
  moonbeamTokenConfig,
  Networks,
  OnChainToken,
  OnChainTokenDetails,
  RampDirection,
  stellarTokenConfig
} from "@packages/shared";
import { useMemo } from "react";
import { useOnchainTokenBalances } from "../../../hooks/useOnchainTokenBalances";
import { useRampDirection } from "../../../stores/rampDirectionStore";
import { useTokenSelectionState } from "../../../stores/tokenSelectionStore";
import { ExtendedTokenDefinition } from "./hooks/useTokenSelection";

export function useTokenDefinitions(filter: string, selectedNetworkFilter: Networks | "all") {
  const { tokenSelectModalType } = useTokenSelectionState();
  const rampDirection = useRampDirection();

  // Get all supported tokens
  const allDefinitions = useMemo(
    () => getAllSupportedTokenDefinitions(tokenSelectModalType, rampDirection),
    [tokenSelectModalType, rampDirection]
  );

  // Get available networks from the token definitions
  const availableNetworks = useMemo(() => {
    const networks = new Set(allDefinitions.map(token => token.network));
    return Array.from(networks).sort();
  }, [allDefinitions]);

  // Filter by selected network
  const networkFilteredDefinitions = useMemo(() => {
    if (selectedNetworkFilter === "all") {
      return allDefinitions;
    }
    return allDefinitions.filter(token => token.network === selectedNetworkFilter);
  }, [allDefinitions, selectedNetworkFilter]);

  const tokenDetails = useMemo(() => networkFilteredDefinitions.map(d => d.details), [networkFilteredDefinitions]);
  const definitionsWithBalance = useOnchainTokenBalances(tokenDetails as OnChainTokenDetails[]);

  const balanceMap = useMemo(() => {
    if (!definitionsWithBalance.length) return {};

    return definitionsWithBalance.reduce(
      (acc, token) => {
        acc[token.assetSymbol] = token.balance;
        return acc;
      },
      {} as Record<string, string>
    );
  }, [definitionsWithBalance]);

  const sortedDefinitions = useMemo(() => {
    if (!definitionsWithBalance.length) return networkFilteredDefinitions;
    return sortTokenDefinitions(networkFilteredDefinitions, balanceMap);
  }, [networkFilteredDefinitions, balanceMap, definitionsWithBalance.length]);

  // Filter by search term (including network name)
  const filteredDefinitions = useMemo(() => {
    const searchTerm = filter.toLowerCase();
    return sortedDefinitions.filter(
      ({ assetSymbol, name, networkDisplayName }) =>
        assetSymbol.toLowerCase().includes(searchTerm) ||
        (name && name.toLowerCase().includes(searchTerm)) ||
        networkDisplayName.toLowerCase().includes(searchTerm)
    );
  }, [sortedDefinitions, filter]);

  return { availableNetworks, definitions: allDefinitions, filteredDefinitions };
}

function sortTokenDefinitions(
  definitions: ExtendedTokenDefinition[],
  balanceMap: Record<string, string>
): ExtendedTokenDefinition[] {
  return [...definitions].sort((a, b) => {
    const balanceA = balanceMap[a.assetSymbol] || "0";
    const balanceB = balanceMap[b.assetSymbol] || "0";
    return Number(balanceB) - Number(balanceA);
  });
}

function getOnChainTokensDefinitionsForNetwork(selectedNetwork: Networks): ExtendedTokenDefinition[] {
  if (selectedNetwork === Networks.AssetHub) {
    return Object.entries(assetHubTokenConfig).map(([key, value]) => ({
      assetIcon: value.networkAssetIcon,
      assetSymbol: value.assetSymbol,
      details: value as OnChainTokenDetails,
      network: selectedNetwork,
      networkDisplayName: getNetworkDisplayName(selectedNetwork),
      type: key as OnChainToken
    }));
  } else if (isNetworkEVM(selectedNetwork)) {
    return Object.entries(evmTokenConfig[selectedNetwork]).map(([key, value]) => ({
      assetIcon: value.networkAssetIcon,
      assetSymbol: value.assetSymbol,
      details: value as OnChainTokenDetails,
      network: selectedNetwork,
      networkDisplayName: getNetworkDisplayName(selectedNetwork),
      type: key as OnChainToken
    }));
  } else throw new Error(`Network ${selectedNetwork} is not a valid origin network`);
}

function getAllOnChainTokens(): ExtendedTokenDefinition[] {
  const allTokens: ExtendedTokenDefinition[] = [];

  // AssetHub tokens
  allTokens.push(...getOnChainTokensDefinitionsForNetwork(Networks.AssetHub));

  // EVM network tokens
  const evmNetworks = Object.values(Networks).filter(isNetworkEVM).filter(doesNetworkSupportRamp) as EvmNetworks[];
  for (const network of evmNetworks) {
    if (evmTokenConfig[network]) {
      allTokens.push(...getOnChainTokensDefinitionsForNetwork(network));
    }
  }

  return allTokens;
}

function getFiatTokens(filterEurcOnly = false): ExtendedTokenDefinition[] {
  const moonbeamEntries = Object.entries(moonbeamTokenConfig);
  const stellarEntries = filterEurcOnly
    ? Object.entries(stellarTokenConfig).filter(([key]) => key === FiatToken.EURC)
    : Object.entries(stellarTokenConfig);

  return [...moonbeamEntries, ...stellarEntries].map(([key, value]) => ({
    assetIcon: value.fiat.assetIcon,
    assetSymbol: value.fiat.symbol,
    details: value as FiatTokenDetails,
    name: value.fiat.name,
    network: key === FiatToken.BRL ? Networks.Moonbeam : Networks.Stellar,
    networkDisplayName:
      key === FiatToken.BRL ? getNetworkDisplayName(Networks.Moonbeam) : getNetworkDisplayName(Networks.Stellar),
    type: getEnumKeyByStringValue(FiatToken, key) as FiatToken
  }));
}

function getAllSupportedTokenDefinitions(type: "from" | "to", direction: RampDirection): ExtendedTokenDefinition[] {
  const isBuy = direction === RampDirection.BUY;

  if ((isBuy && type === "from") || (!isBuy && type === "to")) {
    return getFiatTokens(isBuy && type === "from");
  } else {
    return getAllOnChainTokens();
  }
}
