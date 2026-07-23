import {
  doesNetworkSupportRamp,
  type EvmNetworks,
  type EvmTokenDetails,
  getEvmTokenConfig,
  getNetworkDisplayName,
  isNetworkEVM,
  Networks,
  type OnChainToken
} from "@vortexfi/shared";
import type { CorridorId } from "./types";

export const ONRAMP_CORRIDORS: CorridorId[] = ["BR", "MX", "CO", "US", "AR"];

export interface RampTokenOption {
  currency: OnChainToken;
  label: string;
  network: EvmNetworks;
  networkLabel: string;
  token: EvmTokenDetails;
}

export interface NetworkOption {
  id: EvmNetworks;
  label: string;
}

/** The distinct networks the given tokens live on, alphabetical by display name. */
export function getNetworkOptions(options: RampTokenOption[]): NetworkOption[] {
  const labelByNetwork = new Map(options.map(option => [option.network, option.networkLabel]));
  return [...labelByNetwork].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
}

export function sortRampTokenOptions(options: RampTokenOption[]): RampTokenOption[] {
  return [...options].sort((a, b) => {
    const isStaticA = a.token.isFromStaticConfig === true;
    const isStaticB = b.token.isFromStaticConfig === true;
    if (isStaticA !== isStaticB) {
      return isStaticA ? -1 : 1;
    }
    return a.label.localeCompare(b.label) || a.networkLabel.localeCompare(b.networkLabel);
  });
}

export function filterRampTokenOptions(options: RampTokenOption[], search: string): RampTokenOption[] {
  const term = search.trim().toLowerCase();
  if (!term) {
    return options;
  }
  return options.filter(
    option =>
      option.label.toLowerCase().includes(term) ||
      String(option.currency).toLowerCase().includes(term) ||
      option.networkLabel.toLowerCase().includes(term)
  );
}

/** Every EVM token the ramp supports, in both directions — bought on BUY, sold on SELL. */
export function getRampTokenOptions(): RampTokenOption[] {
  const config = getEvmTokenConfig();
  const options: RampTokenOption[] = [];

  for (const network of Object.values(Networks)) {
    if (!isNetworkEVM(network) || !doesNetworkSupportRamp(network)) {
      continue;
    }

    const byToken = new Map<EvmTokenDetails, string>();
    for (const [key, token] of Object.entries(config[network] ?? {})) {
      if (!token) {
        continue;
      }
      const existingKey = byToken.get(token);
      if (!existingKey || (existingKey.includes(".") && !key.includes("."))) {
        byToken.set(token, key);
      }
    }

    for (const [token, key] of byToken) {
      options.push({
        currency: key as OnChainToken,
        label: token.assetSymbol,
        network,
        networkLabel: getNetworkDisplayName(network),
        token
      });
    }
  }

  return sortRampTokenOptions(options);
}
