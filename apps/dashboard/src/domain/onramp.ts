import type { MoneriumRampReadiness } from "@vortexfi/kyc";
import {
  doesNetworkSupportEurOnramp,
  doesNetworkSupportRamp,
  type EvmNetworks,
  EvmToken,
  type EvmTokenDetails,
  getEvmTokenConfig,
  getNetworkDisplayName,
  isNetworkEVM,
  Networks,
  type OnChainToken,
  RampDirection
} from "@vortexfi/shared";
import type { CorridorId } from "./types";

/** Corridors the onramp transfer form can execute. */
export const ONRAMP_CORRIDORS: CorridorId[] = ["BR", "EU", "MX", "CO", "US", "AR"];

export type EurOnrampBlocker = "connect_wallet" | "link_wallet" | "wrong_wallet";

/**
 * Why an approved EU sender cannot register a EUR pay-in yet. The backend mints to the wallet
 * linked to the Monerium profile and needs that wallet's permit, so the connected wallet must be
 * the linked one and the profile's IBAN must already point to it.
 */
export function eurOnrampBlocker(
  ramp: MoneriumRampReadiness | null | undefined,
  connectedAddress: string | undefined
): EurOnrampBlocker | null {
  if (!ramp || ramp.iban !== "provisioned" || !ramp.linkedAddress) return "link_wallet";
  if (!connectedAddress) return "connect_wallet";
  return connectedAddress.toLowerCase() === ramp.linkedAddress.toLowerCase() ? null : "wrong_wallet";
}

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

/**
 * The distinct networks the given tokens live on, alphabetical by display name. A pay-in corridor
 * narrows them to the destinations its flow can serve (EUR mints on Polygon and bridges onward).
 */
export function getNetworkOptions(options: RampTokenOption[], corridorId?: CorridorId): NetworkOption[] {
  const labelByNetwork = new Map(options.map(option => [option.network, option.networkLabel]));
  return [...labelByNetwork]
    .filter(([id]) => corridorId !== "EU" || doesNetworkSupportEurOnramp(id))
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
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

/** Every EVM token the selected ramp direction supports. */
export function getRampTokenOptions(direction: RampDirection): RampTokenOption[] {
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
      if (direction === RampDirection.BUY && key === EvmToken.POL) {
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
