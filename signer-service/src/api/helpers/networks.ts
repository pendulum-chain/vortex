import { polygon, bsc, arbitrum, base, avalanche, moonbeam, mainnet as ethereum } from '@reown/appkit/networks';

// For the AssetHub network, we use a chain ID of -1. This is not a valid chain ID
// but we just use it to differentiate between the EVM and Polkadot accounts.
export const ASSETHUB_CHAIN_ID = -1;

export enum Networks {
  AssetHub = 'AssetHub',
  Arbitrum = 'Arbitrum',
  Avalanche = 'Avalanche',
  Base = 'Base',
  BSC = 'BSC',
  Ethereum = 'Ethereum',
  Polygon = 'Polygon',
  Moonbeam = 'Moonbeam',
}

const DEFAULT_NETWORK = Networks.AssetHub;

type EVMNetworks = Exclude<Networks, Networks.AssetHub>;

interface NetworkMetadata {
  id: number;
  displayName: string;
  isEVM: boolean;
}

const NETWORK_METADATA: Record<Networks, NetworkMetadata> = {
  [Networks.AssetHub]: {
    id: ASSETHUB_CHAIN_ID,
    displayName: 'Polkadot AssetHub',
    isEVM: false,
  },
  [Networks.Polygon]: {
    id: polygon.id,
    displayName: 'Polygon',
    isEVM: true,
  },
  [Networks.Ethereum]: {
    id: ethereum.id,
    displayName: 'Ethereum',
    isEVM: true,
  },
  [Networks.BSC]: {
    id: bsc.id,
    displayName: 'BNB Smart Chain',
    isEVM: true,
  },
  [Networks.Arbitrum]: {
    id: arbitrum.id,
    displayName: 'Arbitrum One',
    isEVM: true,
  },
  [Networks.Base]: {
    id: base.id,
    displayName: 'Base',
    isEVM: true,
  },
  [Networks.Avalanche]: {
    id: avalanche.id,
    displayName: 'Avalanche',
    isEVM: true,
  },
  [Networks.Moonbeam]: {
    id: moonbeam.id,
    displayName: 'Moonbeam',
    isEVM: true,
  },
};

export function isNetworkEVM(network: Networks): network is EVMNetworks {
  return NETWORK_METADATA[network].isEVM;
}

export function getNetworkId(network: Networks): number {
  return NETWORK_METADATA[network].id;
}

export function getNetworkDisplayName(network: Networks): string {
  return NETWORK_METADATA[network].displayName;
}

export function getCaseSensitiveNetwork(network: string): Networks {
  const normalized = network.toLowerCase();
  return Object.values(Networks).find((n) => n.toLowerCase() === normalized) ?? DEFAULT_NETWORK;
}
