import { ApiPromise } from "@polkadot/api";
import { AssetHubTokenDetails, assetHubTokenConfig, Networks, nativeToDecimal } from "@vortexfi/shared";
import { BalanceMap, getBalanceKey, TokenBalance } from "./types";

function getAllSupportedAssetHubTokens(): AssetHubTokenDetails[] {
  return Object.values(assetHubTokenConfig);
}

async function fetchNativeBalance(
  api: ApiPromise,
  substrateAddress: string,
  nativeToken: AssetHubTokenDetails
): Promise<TokenBalance> {
  try {
    const accountInfo = await api.query.system.account(substrateAddress);
    const accountData = accountInfo.toJSON() as { data: { free: number } };
    const freeBalance = accountData.data.free || 0;
    const balance = nativeToDecimal(freeBalance, nativeToken.decimals).toFixed(4, 0).toString();

    return { balance, balanceUsd: "0.00" };
  } catch (error) {
    console.error("Error fetching AssetHub native balance:", error);
    return { balance: "0.00", balanceUsd: "0.00" };
  }
}

async function fetchAssetBalances(
  api: ApiPromise,
  substrateAddress: string,
  assetTokens: AssetHubTokenDetails[]
): Promise<BalanceMap> {
  const balances = new Map<string, TokenBalance>();

  if (assetTokens.length === 0) {
    return balances;
  }

  try {
    const assetIds = [...new Set(assetTokens.map(t => t.foreignAssetId).filter(Boolean))];
    const assetInfos = await api.query.assets.asset.multi(assetIds);
    const accountQueries = assetIds.map(id => [id, substrateAddress]);
    const accountInfos = await api.query.assets.account.multi(accountQueries);

    const assetInfoMap = new Map();
    const accountInfoMap = new Map();
    assetIds.forEach((id, i) => {
      assetInfoMap.set(id, assetInfos[i]);
      accountInfoMap.set(id, accountInfos[i]);
    });

    for (const token of assetTokens) {
      const assetId = token.foreignAssetId;
      let balance = "0.00";

      if (assetId != null) {
        const assetInfo = assetInfoMap.get(assetId);
        const accountInfo = accountInfoMap.get(assetId);
        const rawMinBalance = assetInfo ? (assetInfo.toJSON()?.minBalance ?? 0) : 0;
        const rawBalance = accountInfo ? (accountInfo.toJSON()?.balance ?? 0) : 0;
        const offrampableBalance = rawBalance > 0 ? rawBalance - rawMinBalance : 0;
        balance = nativeToDecimal(offrampableBalance, token.decimals).toFixed(2, 0).toString();
      }

      balances.set(getBalanceKey(Networks.AssetHub, token.assetSymbol), {
        balance,
        balanceUsd: "0.00"
      });
    }
  } catch (error) {
    console.error("Error fetching AssetHub asset balances:", error);
  }

  return balances;
}

export async function fetchAssetHubBalances(api: ApiPromise, substrateAddress: string): Promise<BalanceMap> {
  const balances = new Map<string, TokenBalance>();
  const assetHubTokens = getAllSupportedAssetHubTokens();

  const assetTokens = assetHubTokens.filter(t => !t.isNative);
  const nativeToken = assetHubTokens.find(t => t.isNative);

  if (nativeToken) {
    const nativeBalance = await fetchNativeBalance(api, substrateAddress, nativeToken);
    balances.set(getBalanceKey(Networks.AssetHub, nativeToken.assetSymbol), nativeBalance);
  }

  const assetBalances = await fetchAssetBalances(api, substrateAddress, assetTokens);
  assetBalances.forEach((value, key) => balances.set(key, value));

  return balances;
}
