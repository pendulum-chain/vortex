import { polygon, bsc, arbitrum, base, avalanche, mainnet as ethereum } from '@reown/appkit/networks';

// For the AssetHub network, we use a chain ID of -1. This is not a valid chain ID
// but we just use it to differentiate between the EVM and Polkadot accounts.
export const ASSETHUB_CHAIN_ID = -1;

export enum Networks {
  // Polkadot networks
  AssetHub = 'AssetHub',
  // EVM networks
  Arbitrum = 'Arbitrum',
  Avalanche = 'Avalanche',
  Base = 'Base',
  BSC = 'BSC',
  Ethereum = 'Ethereum',
  Polygon = 'Polygon',
}

type EVMNetworks = Exclude<Networks, Networks.AssetHub>;

const EVM_NETWORKS: Set<Networks> = new Set([
  Networks.Polygon,
  Networks.Ethereum,
  Networks.BSC,
  Networks.Arbitrum,
  Networks.Base,
  Networks.Avalanche,
]);

export function isNetworkEVM(network: Networks): network is EVMNetworks {
  return EVM_NETWORKS.has(network);
}

const NETWORK_CONFIG: Record<Networks, { id: number }> = {
  [Networks.Polygon]: polygon,
  [Networks.Ethereum]: ethereum,
  [Networks.BSC]: bsc,
  [Networks.Arbitrum]: arbitrum,
  [Networks.Base]: base,
  [Networks.Avalanche]: avalanche,
  [Networks.AssetHub]: { id: ASSETHUB_CHAIN_ID },
};

export function getNetworkId(network: Networks): number {
  return NETWORK_CONFIG[network].id;
}

export function getCaseSensitiveNetwork(network: string): Networks {
  const normalized = network.toLowerCase();
  return Object.values(Networks).find((n) => n.toLowerCase() === normalized) ?? Networks.AssetHub;
}

const NETWORK_DISPLAY_NAMES: Record<Networks, string> = {
  [Networks.AssetHub]: 'Polkadot AssetHub',
  [Networks.Polygon]: 'Polygon',
  [Networks.Ethereum]: 'Ethereum',
  [Networks.BSC]: 'BNB Smart Chain',
  [Networks.Arbitrum]: 'Arbitrum One',
  [Networks.Base]: 'Base',
  [Networks.Avalanche]: 'Avalanche',
};

export function getNetworkDisplayName(network: Networks): string {
  return NETWORK_DISPLAY_NAMES[network] ?? network;
}
