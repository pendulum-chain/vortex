import {
  assetHubTokenConfig,
  doesNetworkSupportRamp,
  EvmNetworks,
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
} from "@vortexfi/shared";
import { useMemo, useRef } from "react";
import { getEvmTokenConfig } from "../../../services/tokens";
import { useRampDirection } from "../../../stores/rampDirectionStore";
import { useTokenSelectionState } from "../../../stores/tokenSelectionStore";
import { ExtendedTokenDefinition } from "./hooks/useTokenSelection";

function useDeepStableReference<T>(value: T[]): T[] {
  const ref = useRef<T[]>(value);

  const isChanged = useMemo(() => {
    if (ref.current.length !== value.length) return true;

    return JSON.stringify(ref.current) !== JSON.stringify(value);
  }, [value]);

  if (isChanged) {
    ref.current = value;
  }

  return ref.current;
}

export function useTokenDefinitions(filter: string, selectedNetworkFilter: Networks | "all") {
  const { tokenSelectModalType } = useTokenSelectionState();
  const rampDirection = useRampDirection();

  const rawDefinitions = useMemo(
    () => getAllSupportedTokenDefinitions(tokenSelectModalType, rampDirection),
    [tokenSelectModalType, rampDirection]
  );

  const allDefinitions = useDeepStableReference(rawDefinitions);

  const availableNetworks = useMemo(() => {
    const networks = new Set(allDefinitions.map(token => token.network));
    return Array.from(networks).sort();
  }, [allDefinitions]);

  const rawNetworkFiltered = useMemo(() => {
    if (selectedNetworkFilter === "all") {
      return allDefinitions;
    }
    return allDefinitions.filter(token => token.network === selectedNetworkFilter);
  }, [allDefinitions, selectedNetworkFilter]);

  const networkFilteredDefinitions = useDeepStableReference(rawNetworkFiltered);

  const filteredDefinitions = useMemo(() => {
    const searchTerm = filter.toLowerCase();

    return networkFilteredDefinitions.filter(
      ({ assetSymbol, name, networkDisplayName }) =>
        assetSymbol.toLowerCase().includes(searchTerm) ||
        (name && name.toLowerCase().includes(searchTerm)) ||
        networkDisplayName.toLowerCase().includes(searchTerm)
    );
  }, [networkFilteredDefinitions, filter]);

  return {
    availableNetworks,
    definitions: allDefinitions,
    filteredDefinitions: isFiatDirection(tokenSelectModalType, rampDirection) ? allDefinitions : filteredDefinitions
  };
}

function getOnChainTokensDefinitionsForNetwork(selectedNetwork: Networks): ExtendedTokenDefinition[] {
  if (selectedNetwork === Networks.AssetHub) {
    return Object.entries(assetHubTokenConfig).map(([key, value]) => ({
      assetIcon: value.networkAssetIcon,
      assetSymbol: value.assetSymbol,
      details: value as OnChainTokenDetails,
      logoURI: value.logoURI,
      network: selectedNetwork,
      networkDisplayName: getNetworkDisplayName(selectedNetwork),
      type: key as OnChainToken
    }));
  } else if (isNetworkEVM(selectedNetwork)) {
    const evmConfig = getEvmTokenConfig();
    const networkConfig = evmConfig[selectedNetwork as EvmNetworks] ?? {};
    return Object.entries(networkConfig).map(([key, value]) => ({
      assetIcon: value?.logoURI ?? value?.networkAssetIcon ?? "",
      assetSymbol: value?.assetSymbol ?? key,
      details: value as OnChainTokenDetails,
      fallbackLogoURI: value?.fallbackLogoURI,
      logoURI: value?.logoURI,
      network: selectedNetwork,
      networkDisplayName: getNetworkDisplayName(selectedNetwork),
      type: key as OnChainToken
    }));
  } else {
    throw new Error(`Network ${selectedNetwork} is not a valid origin network`);
  }
}

function getAllOnChainTokens(): ExtendedTokenDefinition[] {
  const allTokens: ExtendedTokenDefinition[] = [];
  allTokens.push(...getOnChainTokensDefinitionsForNetwork(Networks.AssetHub));
  const evmNetworks = Object.values(Networks).filter(isNetworkEVM).filter(doesNetworkSupportRamp) as EvmNetworks[];
  const evmConfig = getEvmTokenConfig();
  for (const network of evmNetworks) {
    if (evmConfig[network]) {
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

function isFilterEurcOnly(type: "from" | "to", direction: RampDirection) {
  return direction === RampDirection.BUY && type === "from";
}

export function useIsFiatDirection() {
  const { tokenSelectModalType } = useTokenSelectionState();
  const rampDirection = useRampDirection();
  return isFiatDirection(tokenSelectModalType, rampDirection);
}

function isFiatDirection(type: "from" | "to", direction: RampDirection) {
  const isBuy = direction === RampDirection.BUY;
  return (isBuy && type === "from") || (!isBuy && type === "to");
}

function getAllSupportedTokenDefinitions(type: "from" | "to", direction: RampDirection): ExtendedTokenDefinition[] {
  if (isFiatDirection(type, direction)) {
    return getFiatTokens(isFilterEurcOnly(type, direction));
  } else {
    return getAllOnChainTokens();
  }
}
