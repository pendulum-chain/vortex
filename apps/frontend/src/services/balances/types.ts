import { ApiPromise } from "@polkadot/api";

export interface TokenBalance {
  balance: string;
  balanceUsd: string;
}

export type BalanceMap = Map<string, TokenBalance>;

export function getBalanceKey(network: string, symbol: string): string {
  return `${network}-${symbol}`;
}

export function mergeBalanceMaps(...maps: BalanceMap[]): BalanceMap {
  const merged = new Map<string, TokenBalance>();
  for (const map of maps) {
    map.forEach((value, key) => merged.set(key, value));
  }
  return merged;
}

export interface FetchBalancesParams {
  evmAddress: string | null;
  substrateAddress: string | null;
  assethubApi?: ApiPromise;
}
