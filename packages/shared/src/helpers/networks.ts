import { arbitrum, avalanche, base, bsc, mainnet as ethereum, moonbeam, polygon, polygonAmoy } from "viem/chains";
import { PaymentMethod } from "../endpoints/payment-methods.endpoints";

export type DestinationType = Networks | PaymentMethod;

export enum Networks {
  AssetHub = "assethub",
  Paseo = "paseo",
  Arbitrum = "arbitrum",
  Avalanche = "avalanche",
  Base = "base",
  BSC = "bsc",
  Ethereum = "ethereum",
  Hydration = "hydration",
  Polygon = "polygon",
  Moonbeam = "moonbeam",
  Pendulum = "pendulum",
  Stellar = "stellar",
  PolygonAmoy = "polygonAmoy"
}

// This type is used to represent all networks that can be used as a source or destination in the system.
export type EvmNetworks =
  | Networks.Arbitrum
  | Networks.Avalanche
  | Networks.Base
  | Networks.BSC
  | Networks.Ethereum
  | Networks.Moonbeam
  | Networks.Polygon
  | Networks.PolygonAmoy;

/**
 * Checks if a destination is a network and returns the network if it is.
 * Returns undefined if the destination is a payment method or not a valid network.
 * @param destination The destination to check
 */
export function getNetworkFromDestination(destination: DestinationType): Networks | undefined {
  if (Object.values(Networks).includes(destination as Networks)) {
    return destination as Networks;
  }
  return undefined;
}

// For the AssetHub/Pendulum/Stellar network, we use a chain ID of -x. This is not a valid chain ID
// but we just use it to differentiate between the EVM and Polkadot/Stellar accounts.
export const ASSETHUB_CHAIN_ID = -1;
export const PENDULUM_CHAIN_ID = -2;
export const HYDRATION_CHAIN_ID = -3;
export const STELLAR_CHAIN_ID = -99;

interface NetworkMetadata {
  id: number;
  displayName: string;
  isEVM: boolean;
  supportsRamp: boolean;
}

const NETWORK_METADATA: Record<Networks, NetworkMetadata> = {
  [Networks.AssetHub]: {
    displayName: "Polkadot AssetHub",
    id: ASSETHUB_CHAIN_ID,
    isEVM: false,
    supportsRamp: true
  },
  [Networks.Paseo]: {
    displayName: "Paseo",
    id: ASSETHUB_CHAIN_ID,
    isEVM: false,
    supportsRamp: false
  },
  [Networks.Hydration]: {
    displayName: "Hydration",
    id: HYDRATION_CHAIN_ID,
    isEVM: false,
    supportsRamp: false
  },
  [Networks.Polygon]: {
    displayName: "Polygon",
    id: polygon.id,
    isEVM: true,
    supportsRamp: true
  },
  [Networks.PolygonAmoy]: {
    displayName: "Polygon Amoy",
    id: polygonAmoy.id,
    isEVM: true,
    supportsRamp: false
  },
  [Networks.Ethereum]: {
    displayName: "Ethereum",
    id: ethereum.id,
    isEVM: true,
    supportsRamp: true
  },
  [Networks.BSC]: {
    displayName: "BNB Smart Chain",
    id: bsc.id,
    isEVM: true,
    supportsRamp: true
  },
  [Networks.Arbitrum]: {
    displayName: "Arbitrum One",
    id: arbitrum.id,
    isEVM: true,
    supportsRamp: true
  },
  [Networks.Base]: {
    displayName: "Base",
    id: base.id,
    isEVM: true,
    supportsRamp: true
  },
  [Networks.Avalanche]: {
    displayName: "Avalanche",
    id: avalanche.id,
    isEVM: true,
    supportsRamp: true
  },
  [Networks.Moonbeam]: {
    displayName: "Moonbeam",
    id: moonbeam.id,
    isEVM: true,
    supportsRamp: false
  },
  [Networks.Pendulum]: {
    displayName: "Pendulum",
    id: PENDULUM_CHAIN_ID,
    isEVM: false,
    supportsRamp: false
  },
  [Networks.Stellar]: {
    displayName: "Stellar",
    id: STELLAR_CHAIN_ID,
    isEVM: false,
    supportsRamp: false
  }
};

export function getCaseSensitiveNetwork(network: string): Networks | undefined {
  const normalized = network.toLowerCase();
  return Object.values(Networks).find(n => n.toLowerCase() === normalized);
}

export function getNetworkMetadata(network: string): NetworkMetadata | undefined {
  const normalizedNetwork = getCaseSensitiveNetwork(network);
  return normalizedNetwork ? NETWORK_METADATA[normalizedNetwork] : undefined;
}

export function doesNetworkSupportRamp(network: Networks): boolean {
  return getNetworkMetadata(network)?.supportsRamp ?? false;
}

export function isNetworkEVM(network: Networks): network is EvmNetworks {
  return getNetworkMetadata(network)?.isEVM ?? false;
}

export function isNetworkAssetHub(network: Networks): network is Networks.AssetHub {
  return getNetworkMetadata(network)?.id === ASSETHUB_CHAIN_ID;
}

export function getNetworkId(network: Networks): number;
export function getNetworkId(network: unknown): number | undefined;
export function getNetworkId(network: Networks | unknown): number | undefined {
  return getNetworkMetadata(network as Networks)?.id;
}

export function getNetworkDisplayName(network: Networks): string;
export function getNetworkDisplayName(network: unknown): string | undefined;
export function getNetworkDisplayName(network: Networks | unknown): string | undefined {
  return getNetworkMetadata(network as Networks)?.displayName;
}
