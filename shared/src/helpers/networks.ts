import {polygon, bsc, arbitrum, base, avalanche, moonbeam, mainnet as ethereum} from 'viem/chains';

export type PaymentMethod = 'pix' | 'sepa' | 'cbu';
export type DestinationType = `${Networks}` | PaymentMethod;

export enum Networks {
  AssetHub = 'assethub',
  Arbitrum = 'arbitrum',
  Avalanche = 'avalanche',
  Base = 'base',
  BSC = 'bsc',
  Ethereum = 'ethereum',
  Polygon = 'polygon',
  Moonbeam = 'moonbeam',
  Pendulum = 'pendulum',
  Stellar = 'stellar',
  Solana = 'solana',
}

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
export const STELLAR_CHAIN_ID = -99;

const DEFAULT_NETWORK = Networks.AssetHub;

type EVMNetworks = Exclude<Networks, Networks.AssetHub>;

interface NetworkMetadata {
  id: number | string;
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
  [Networks.Solana]: {
    id: "solana-mainnet-beta", // This is used by squidrouter
    displayName: 'Solana',
    isEVM: true, // Technically not EVM, but we treat it as such for compatibility with the wallet connector
  },
  [Networks.Pendulum]: {
    id: PENDULUM_CHAIN_ID,
    displayName: 'Pendulum',
    isEVM: false,
  },
  [Networks.Stellar]: {
    id: STELLAR_CHAIN_ID,
    displayName: 'Stellar',
    isEVM: false,
  },
};

export function isNetworkEVM(network: Networks): network is EVMNetworks {
  return NETWORK_METADATA[network].isEVM;
}

export function getNetworkId(network: Networks): number | string {
  return NETWORK_METADATA[network].id;
}

export function getNetworkDisplayName(network: Networks): string {
  return NETWORK_METADATA[network].displayName;
}

export function getCaseSensitiveNetwork(network: string): Networks {
  const normalized = network.toLowerCase();
  return Object.values(Networks).find((n) => n.toLowerCase() === normalized) ?? DEFAULT_NETWORK;
}
