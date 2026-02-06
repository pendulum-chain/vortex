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
import { useMemo } from "react";
import { getEvmTokenConfig } from "../../../services/tokens";
import { useRampDirection } from "../../../stores/rampDirectionStore";
import { useTokenSelectionState } from "../../../stores/tokenSelectionStore";
import { ExtendedTokenDefinition } from "./hooks/useTokenSelection";

export function useTokenDefinitions(filter: string, selectedNetworkFilter: Networks | "all") {
  const { tokenSelectModalType } = useTokenSelectionState();
  const rampDirection = useRampDirection();

  const allDefinitions = useMemo(
    () => getAllSupportedTokenDefinitions(tokenSelectModalType, rampDirection),
    [tokenSelectModalType, rampDirection]
  );

  const availableNetworks = useMemo(() => {
    const networks = new Set(allDefinitions.map(token => token.network));
    return Array.from(networks).sort();
  }, [allDefinitions]);

  const networkFiltered = useMemo(() => {
    if (selectedNetworkFilter === "all") {
      return allDefinitions;
    }
    return allDefinitions.filter(token => token.network === selectedNetworkFilter);
  }, [allDefinitions, selectedNetworkFilter]);

  const filteredDefinitions = useMemo(() => {
    if (!filter) return networkFiltered;

    const searchTerm = filter.toLowerCase();
    return networkFiltered.filter(
      ({ assetSymbol, name, networkDisplayName }) =>
        assetSymbol.toLowerCase().includes(searchTerm) ||
        (name && name.toLowerCase().includes(searchTerm)) ||
        networkDisplayName.toLowerCase().includes(searchTerm)
    );
  }, [networkFiltered, filter]);

  return {
    availableNetworks,
    definitions: allDefinitions,
    filteredDefinitions: isFiatDirection(tokenSelectModalType, rampDirection) ? allDefinitions : filteredDefinitions
  };
}

function getOnChainTokensDefinitionsForNetwork(selectedNetwork: Networks): ExtendedTokenDefinition[] {
  if (selectedNetwork === Networks.AssetHub) {
    return Object.entries(assetHubTokenConfig).map(([key, value]) => ({
      assetIcon: value.assetSymbol,
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
    const byToken = new Map<OnChainTokenDetails, string>();

    for (const [key, value] of Object.entries(networkConfig)) {
      if (!value) continue;
      const token = value as OnChainTokenDetails;
      const existingKey = byToken.get(token);

      if (!existingKey) {
        byToken.set(token, key);
        continue;
      }

      // Prefer enum-like keys without dots (e.g., "AXLUSDC" over "USDC.AXL")
      if (existingKey.includes(".") && !key.includes(".")) {
        byToken.set(token, key);
      }
    }

    return Array.from(byToken.entries()).map(([details, key]) => ({
      assetIcon: details.assetSymbol ?? key,
      assetSymbol: details.assetSymbol ?? key,
      details,
      fallbackLogoURI: details.fallbackLogoURI,
      logoURI: details.logoURI,
      network: selectedNetwork,
      networkDisplayName: getNetworkDisplayName(selectedNetwork),
      type: key as OnChainToken
    }));
  } else {
    throw new Error(`Network ${selectedNetwork} is not a valid origin network`);
  }
}

let cachedOnChainTokens: ExtendedTokenDefinition[] | null = null;
let cachedEvmConfigRef: ReturnType<typeof getEvmTokenConfig> | null = null;

function getAllOnChainTokens(): ExtendedTokenDefinition[] {
  const currentEvmConfig = getEvmTokenConfig();

  if (cachedOnChainTokens && cachedEvmConfigRef === currentEvmConfig) {
    return cachedOnChainTokens;
  }

  const allTokens: ExtendedTokenDefinition[] = [];
  allTokens.push(...getOnChainTokensDefinitionsForNetwork(Networks.AssetHub));
  const evmNetworks = Object.values(Networks).filter(isNetworkEVM).filter(doesNetworkSupportRamp) as EvmNetworks[];
  for (const network of evmNetworks) {
    if (currentEvmConfig[network]) {
      allTokens.push(...getOnChainTokensDefinitionsForNetwork(network));
    }
  }

  cachedOnChainTokens = allTokens;
  cachedEvmConfigRef = currentEvmConfig;
  return allTokens;
}

export function invalidateOnChainTokensCache(): void {
  cachedOnChainTokens = null;
  cachedEvmConfigRef = null;
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
