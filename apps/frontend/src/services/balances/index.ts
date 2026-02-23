import { fetchAssetHubBalances } from "./assetHubBalanceFetcher";
import { fetchEvmBalances } from "./evmBalanceFetcher";
import { BalanceMap, FetchBalancesParams, mergeBalanceMaps } from "./types";

export async function fetchAllBalances({
  evmAddress,
  substrateAddress,
  assethubApi
}: FetchBalancesParams): Promise<BalanceMap> {
  const results: BalanceMap[] = [];

  const promises: Promise<BalanceMap>[] = [];

  if (evmAddress) {
    promises.push(fetchEvmBalances(evmAddress));
  }

  if (substrateAddress && assethubApi) {
    promises.push(fetchAssetHubBalances(assethubApi, substrateAddress));
  }

  const fetchedResults = await Promise.all(promises);
  results.push(...fetchedResults);

  return mergeBalanceMaps(...results);
}

export type { BalanceMap, FetchBalancesParams, TokenBalance } from "./types";
export { getBalanceKey } from "./types";
