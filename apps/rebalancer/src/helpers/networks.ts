import { arbitrum, avalanche, base, bsc, mainnet as ethereum, moonbeam, polygon } from "viem/chains";

export enum Networks {
  AssetHub = "assethub",
  Arbitrum = "arbitrum",
  Avalanche = "avalanche",
  Base = "base",
  BSC = "bsc",
  Ethereum = "ethereum",
  Polygon = "polygon",
  Moonbeam = "moonbeam",
  Pendulum = "pendulum",
  Stellar = "stellar"
}

// This type is used to represent all networks that can be used as a source or destination in the system.
export type EvmNetworks =
  | Networks.Arbitrum
  | Networks.Avalanche
  | Networks.Base
  | Networks.BSC
  | Networks.Ethereum
  | Networks.Moonbeam
  | Networks.Polygon;

// For the AssetHub/Pendulum/Stellar network, we use a chain ID of -x. This is not a valid chain ID
// but we just use it to differentiate between the EVM and Polkadot/Stellar accounts.
export const ASSETHUB_CHAIN_ID = -1;
export const PENDULUM_CHAIN_ID = -2;
export const STELLAR_CHAIN_ID = -99;

interface NetworkMetadata {
  id: number;
  displayName: string;
  isEVM: boolean;
}

const NETWORK_METADATA: Record<Networks, NetworkMetadata> = {
  [Networks.AssetHub]: {
    displayName: "Polkadot AssetHub",
    id: ASSETHUB_CHAIN_ID,
    isEVM: false
  },
  [Networks.Polygon]: {
    displayName: "Polygon",
    id: polygon.id,
    isEVM: true
  },
  [Networks.Ethereum]: {
    displayName: "Ethereum",
    id: ethereum.id,
    isEVM: true
  },
  [Networks.BSC]: {
    displayName: "BNB Smart Chain",
    id: bsc.id,
    isEVM: true
  },
  [Networks.Arbitrum]: {
    displayName: "Arbitrum One",
    id: arbitrum.id,
    isEVM: true
  },
  [Networks.Base]: {
    displayName: "Base",
    id: base.id,
    isEVM: true
  },
  [Networks.Avalanche]: {
    displayName: "Avalanche",
    id: avalanche.id,
    isEVM: true
  },
  [Networks.Moonbeam]: {
    displayName: "Moonbeam",
    id: moonbeam.id,
    isEVM: true
  },
  [Networks.Pendulum]: {
    displayName: "Pendulum",
    id: PENDULUM_CHAIN_ID,
    isEVM: false
  },
  [Networks.Stellar]: {
    displayName: "Stellar",
    id: STELLAR_CHAIN_ID,
    isEVM: false
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
