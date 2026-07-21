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

export interface OnrampTokenOption {
  currency: OnChainToken;
  label: string;
  network: EvmNetworks;
  networkLabel: string;
  token: EvmTokenDetails;
}

export function sortOnrampTokenOptions(options: OnrampTokenOption[]): OnrampTokenOption[] {
  return [...options].sort((a, b) => {
    const isStaticA = a.token.isFromStaticConfig === true;
    const isStaticB = b.token.isFromStaticConfig === true;
    if (isStaticA !== isStaticB) {
      return isStaticA ? -1 : 1;
    }
    return a.label.localeCompare(b.label) || a.networkLabel.localeCompare(b.networkLabel);
  });
}

export function filterOnrampTokenOptions(options: OnrampTokenOption[], search: string): OnrampTokenOption[] {
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

export function getOnrampTokenOptions(): OnrampTokenOption[] {
  const config = getEvmTokenConfig();
  const options: OnrampTokenOption[] = [];

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

  return sortOnrampTokenOptions(options);
}
