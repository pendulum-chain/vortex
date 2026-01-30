import {
  ALCHEMY_API_KEY,
  AssetHubTokenDetails,
  AssetHubTokenDetailsWithBalance,
  assetHubTokenConfig,
  EvmTokenDetails,
  EvmTokenDetailsWithBalance,
  getAllEvmTokens,
  getNetworkId,
  isAssetHubTokenDetails,
  isEvmTokenDetails,
  isNetworkEVM,
  Networks,
  nativeToDecimal,
  OnChainTokenDetails,
  OnChainTokenDetailsWithBalance
} from "@vortexfi/shared";
import Big from "big.js";
import { useEffect, useMemo, useState } from "react";
import { Abi, hexToBigInt } from "viem";

// Global cache to persist balances across hook instances and app lifecycle
const globalBalanceCache = new Map<string, Map<string, string>>();

import { useBalance, useReadContracts } from "wagmi";
import { useNetwork } from "../contexts/network";
import { useAssetHubNode } from "../contexts/polkadotNode";
import erc20ABI from "../contracts/ERC20";
import { multiplyByPowerOfTen } from "../helpers/contracts";
import { getEvmTokensForNetwork } from "../services/tokens";
import { useVortexAccount } from "./useVortexAccount";

interface AlchemyTokenBalancesResponse {
  data: {
    tokens: {
      network: string;
      address: string;
      tokenAddress: string | null;
      tokenBalance: string;
    }[];
    pageKey?: string;
  };
}

const getAlchemyNetworkName = (network: Networks): string | null => {
  if (!ALCHEMY_API_KEY) return null;

  const networkMap: Partial<Record<Networks, string>> = {
    [Networks.Arbitrum]: "arb-mainnet",
    [Networks.Avalanche]: "avax-mainnet",
    [Networks.Base]: "base-mainnet",
    [Networks.BSC]: "bsc-mainnet",
    [Networks.Ethereum]: "eth-mainnet",
    [Networks.Moonbeam]: "moonbeam-mainnet",
    [Networks.Polygon]: "polygon-mainnet"
  };

  const networkName = networkMap[network];
  return networkName || null;
};

const fetchAlchemyTokenBalances = async (address: string, network: Networks): Promise<Map<string, string>> => {
  const networkName = getAlchemyNetworkName(network);
  if (!networkName) {
    return new Map();
  }

  try {
    const endpoint = `https://api.g.alchemy.com/data/v1/${ALCHEMY_API_KEY}/assets/tokens/balances/by-address`;

    const response = await fetch(endpoint, {
      body: JSON.stringify({
        addresses: [
          {
            address,
            networks: [networkName]
          }
        ],
        includeErc20Tokens: true,
        includeNativeTokens: true
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    const data: AlchemyTokenBalancesResponse = await response.json();

    const balanceMap = new Map<string, string>();
    if (data.data?.tokens) {
      data.data.tokens.forEach(token => {
        const tokenAddress = token.tokenAddress || "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
        const key = `${network}-${tokenAddress.toLowerCase()}`;
        // Convert hex balance to decimal string using Big.js
        const decimalBalance = hexToBigInt(token.tokenBalance as `0x${string}`).toString();
        balanceMap.set(key, decimalBalance);
      });
    }

    return balanceMap;
  } catch (error) {
    console.error(`Error fetching balances for ${network}:`, error);
    return new Map();
  }
};

export const useEvmNativeBalance = (): EvmTokenDetailsWithBalance | null => {
  const { evmAddress: address } = useVortexAccount();
  const { selectedNetwork } = useNetwork();
  const chainId = getNetworkId(selectedNetwork);

  const tokensForNetwork: EvmTokenDetails[] = useMemo(() => {
    if (isNetworkEVM(selectedNetwork)) {
      return getEvmTokensForNetwork(selectedNetwork);
    } else return [];
  }, [selectedNetwork]);

  const nativeToken = useMemo(() => tokensForNetwork.find(t => t.isNative), [tokensForNetwork.find]);

  const { data: balance } = useBalance({
    address: address as `0x${string}`,
    chainId: isNetworkEVM(selectedNetwork) ? chainId : undefined,
    query: {
      enabled: !!nativeToken && !!address && isNetworkEVM(selectedNetwork)
    }
  });

  return useMemo(() => {
    if (!nativeToken || !balance || !isNetworkEVM(selectedNetwork)) return null;

    const formattedBalance = multiplyByPowerOfTen(Big(balance.value.toString()), -balance.decimals).toFixed(4, 0);

    // Calculate balanceUsd by finding matching token in getAllEvmTokens by address and network
    const allEvmTokens = getAllEvmTokens();
    const matchingToken = allEvmTokens.find(
      token =>
        token.erc20AddressSourceChain?.toLowerCase() === nativeToken.erc20AddressSourceChain?.toLowerCase() &&
        token.network === nativeToken.network
    );
    const usdPrice = matchingToken?.usdPrice ?? 0;
    const balanceUsd = usdPrice > 0 ? Big(formattedBalance).times(usdPrice).toFixed(2, 0) : "0.00";

    return {
      ...nativeToken,
      balance: formattedBalance,
      balanceUsd
    };
  }, [balance, selectedNetwork, nativeToken]);
};

export const useAssetHubNativeBalance = (): AssetHubTokenDetailsWithBalance | null => {
  const [nativeBalance, setNativeBalance] = useState<AssetHubTokenDetailsWithBalance | null>(null);
  const { substrateAddress } = useVortexAccount();
  const { apiComponents: assethubNode } = useAssetHubNode();
  const { selectedNetwork } = useNetwork();

  const nativeToken = useMemo(() => {
    const assethubTokens = Object.values(assetHubTokenConfig);
    return assethubTokens.find(token => token.isNative);
  }, []);

  useEffect(() => {
    if (!nativeToken || selectedNetwork !== Networks.AssetHub) {
      setNativeBalance(null);
      return;
    }

    // If substrate wallet is not connected or node is not available,
    // still show the token with zero balance
    if (!substrateAddress || !assethubNode) {
      setNativeBalance({
        ...nativeToken,
        balance: "0.0000",
        balanceUsd: "0.00"
      });
      return;
    }

    const getNativeBalance = async () => {
      try {
        const { api } = assethubNode;
        const accountInfo = await api.query.system.account(substrateAddress);
        const accountData = accountInfo.toJSON() as {
          data: {
            free: number;
            reserved: number;
            frozen: number;
          };
        };

        const freeBalance = accountData.data.free || 0;
        const formattedBalance = nativeToDecimal(freeBalance, nativeToken.decimals).toFixed(4, 0).toString();

        setNativeBalance({
          ...nativeToken,
          balance: formattedBalance,
          balanceUsd: "0.00"
        });
      } catch (error) {
        console.error("Error fetching AssetHub native balance:", error);
        setNativeBalance(null);
      }
    };

    getNativeBalance();
  }, [assethubNode, substrateAddress, selectedNetwork, nativeToken]);

  return nativeBalance;
};

const groupTokensByNetwork = (tokens: EvmTokenDetails[]): Record<string, EvmTokenDetails[]> => {
  return tokens.reduce<Record<string, EvmTokenDetails[]>>((acc, token) => {
    if (!acc[token.network]) {
      acc[token.network] = [];
    }
    acc[token.network].push(token);
    return acc;
  }, {});
};

export const useEvmBalances = (tokens: EvmTokenDetails[]): EvmTokenDetailsWithBalance[] => {
  const { evmAddress: address } = useVortexAccount();
  const [balanceMap, setBalanceMap] = useState<Map<string, string>>(new Map());

  const tokensByNetwork = useMemo(() => groupTokensByNetwork(tokens), [tokens]);

  // Fetch balances from Alchemy for all EVM networks once on component mount
  useEffect(() => {
    if (!address) return;

    const fetchAllBalances = async () => {
      // Get all EVM networks from the tokens passed
      const evmNetworks = Object.keys(tokensByNetwork).filter(network => isNetworkEVM(network as Networks)) as Networks[];

      const allBalances = new Map<string, string>();

      for (const network of evmNetworks) {
        const networkTokens = tokensByNetwork[network];
        if (!networkTokens?.length) continue;

        const cacheKey = `${address}-${network}`;
        let balances: Map<string, string>;

        if (globalBalanceCache.has(cacheKey)) {
          balances = globalBalanceCache.get(cacheKey)!;
        } else {
          try {
            balances = await fetchAlchemyTokenBalances(address, network);
            console.log(`[${network}] Balances:`, Object.fromEntries(balances));

            globalBalanceCache.set(cacheKey, balances);
          } catch (error) {
            console.error(`Failed to fetch ${network} balances:`, error);
            balances = new Map();
          }
        }

        balances.forEach((value, key) => {
          allBalances.set(key, value);
        });
      }

      setBalanceMap(allBalances);
    };

    fetchAllBalances();
  }, [address, tokensByNetwork]); // - run when address or tokens change

  // Create a flat list of all tokens with their balances
  const tokensWithBalances = tokens.reduce<Array<EvmTokenDetailsWithBalance>>((prev, curr, index) => {
    const key = `${curr.network}-${curr.erc20AddressSourceChain?.toLowerCase()}`;
    const tokenBalance = balanceMap.get(key); // If we are dealing with a stablecoin, we show 2 decimals, otherwise 6
    const showDecimals = curr.assetSymbol.toLowerCase().includes("usd") ? 2 : 6;

    const balance = tokenBalance ? multiplyByPowerOfTen(Big(tokenBalance), -curr.decimals).toFixed(showDecimals, 0) : "0.00";

    // Calculate balanceUsd by finding matching token in getAllEvmTokens by address and network
    const allEvmTokens = getAllEvmTokens();
    const matchingToken = allEvmTokens.find(
      token =>
        token.erc20AddressSourceChain?.toLowerCase() === curr.erc20AddressSourceChain?.toLowerCase() &&
        token.network === curr.network
    );
    const usdPrice = matchingToken?.usdPrice ?? 0;
    const balanceUsd = usdPrice > 0 ? Big(balance).times(usdPrice).toFixed(2, 0) : "0.00";

    prev.push({
      ...curr,
      balance,
      balanceUsd
    });

    return prev;
  }, []);

  return tokensWithBalances;
};

export const useAssetHubBalances = (tokens: AssetHubTokenDetails[]): AssetHubTokenDetailsWithBalance[] => {
  const [balances, setBalances] = useState<Array<AssetHubTokenDetailsWithBalance>>([]);
  const { substrateAddress } = useVortexAccount();
  const { apiComponents: assethubNode } = useAssetHubNode();

  useEffect(() => {
    // Only process non-native asset tokens here — native token handled by useAssetHubNativeBalance
    if (tokens.length === 0) return;

    const assetTokens = tokens.filter(t => !t.isNative);
    if (assetTokens.length === 0) {
      setBalances([]);
      return;
    }

    // If substrate wallet is not connected or node is not available,
    // still show the tokens with zero balances
    if (!substrateAddress || !assethubNode) {
      setBalances(assetTokens.map(token => ({ ...token, balance: "0.00", balanceUsd: "0.00" })));
      return;
    }

    const getBalances = async () => {
      const { api } = assethubNode;

      // Use unique list of assetIds and preserve mapping
      const assetIds = Array.from(new Set(assetTokens.map(t => t.foreignAssetId).filter(id => id != null)));
      const assetInfos = await api.query.assets.asset.multi(assetIds);
      const accountQueries = assetIds.map(assetId => [assetId, substrateAddress]);
      const accountInfos = await api.query.assets.account.multi(accountQueries);

      // Build maps by assetId
      const assetInfoMap = new Map<any, any>();
      assetIds.forEach((id, i) => assetInfoMap.set(id, assetInfos[i]));

      const accountInfoMap = new Map<any, any>();
      assetIds.forEach((id, i) => accountInfoMap.set(id, accountInfos[i]));

      const tokensWithBalances = assetTokens.map(token => {
        const assetId = token.foreignAssetId;
        let balance: string;

        // assetId should exist for asset tokens; if missing, fallback to zero
        if (assetId == null) {
          balance = "0.00";
        } else {
          const assetInfo = assetInfoMap.get(assetId);
          const accountInfo = accountInfoMap.get(assetId);

          const rawMinBalance = assetInfo ? ((assetInfo.toJSON() as any).minBalance ?? 0) : 0;
          const rawBalance = accountInfo ? ((accountInfo.toJSON() as any).balance ?? 0) : 0;
          const offrampableBalance = rawBalance > 0 ? rawBalance - rawMinBalance : 0;
          balance = nativeToDecimal(offrampableBalance, token.decimals).toFixed(2, 0).toString();
        }

        return { ...token, balance, balanceUsd: "0.00" };
      });

      setBalances(tokensWithBalances);
    };

    getBalances();
  }, [assethubNode, tokens, substrateAddress]);

  return balances;
};

export const useOnchainTokenBalances = (tokens: OnChainTokenDetails[]): OnChainTokenDetailsWithBalance[] => {
  const evmTokens = useMemo(() => tokens.filter(isEvmTokenDetails) as EvmTokenDetailsWithBalance[], [tokens]);
  const substrateTokens = useMemo(() => tokens.filter(isAssetHubTokenDetails) as AssetHubTokenDetailsWithBalance[], [tokens]);

  const evmBalances = useEvmBalances(evmTokens);
  const substrateBalances = useAssetHubBalances(substrateTokens);
  const evmNativeBalance = useEvmNativeBalance();
  const assethubNativeBalance = useAssetHubNativeBalance();

  return useMemo(() => {
    // Combine all token balances
    const allTokens = [...evmBalances, ...substrateBalances, assethubNativeBalance, evmNativeBalance].filter(Boolean);

    // Deduplicate tokens by network-symbol and type (native vs asset)
    const uniqueTokens = new Map();
    allTokens.forEach(token => {
      if (token) {
        const isNative = "isNative" in token ? token.isNative : false;
        const assetId = "foreignAssetId" in token ? token.foreignAssetId : null;
        const key = `${token.network}-${token.assetSymbol}-${isNative}-${assetId}`;
        if (!uniqueTokens.has(key)) {
          uniqueTokens.set(key, token);
        }
      }
    });

    return Array.from(uniqueTokens.values()) as OnChainTokenDetailsWithBalance[];
  }, [assethubNativeBalance, evmBalances, substrateBalances, evmNativeBalance]);
};
