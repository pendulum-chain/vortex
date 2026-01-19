import {
  ALCHEMY_API_KEY,
  AssetHubTokenDetails,
  AssetHubTokenDetailsWithBalance,
  assetHubTokenConfig,
  EvmTokenDetails,
  EvmTokenDetailsWithBalance,
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
import { Abi } from "viem";
import { useBalance, useReadContracts } from "wagmi";
import { useNetwork } from "../contexts/network";
import { useAssetHubNode } from "../contexts/polkadotNode";
import erc20ABI from "../contracts/ERC20";
import { multiplyByPowerOfTen } from "../helpers/contracts";
import { getEvmTokensForNetwork } from "../services/tokens";
import { useVortexAccount } from "./useVortexAccount";

interface AlchemyResponse {
  jsonrpc: string;
  id: number;
  result: {
    address: string;
    tokenBalances: {
      contractAddress: string;
      tokenBalance: string;
    }[];
  };
}

const getAlchemyEndpoint = (network: Networks): string | null => {
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

  const subdomain = networkMap[network];
  console.log("Alchemy subdomain", subdomain);
  return subdomain ? `https://${subdomain}.g.alchemy.com/v2/${ALCHEMY_API_KEY}` : null;
};

const fetchAlchemyTokenBalances = async (
  address: string,
  tokenAddresses: string[],
  network: Networks
): Promise<Map<string, string>> => {
  const endpoint = getAlchemyEndpoint(network);
  if (!endpoint || tokenAddresses.length === 0) {
    return new Map();
  }

  try {
    const response = await fetch(endpoint, {
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "alchemy_getTokenBalances",
        params: [address, tokenAddresses]
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    const data: AlchemyResponse = await response.json();

    const balanceMap = new Map<string, string>();
    if (data.result?.tokenBalances) {
      data.result.tokenBalances.forEach(tokenBalance => {
        // Key includes network to avoid collisions across chains
        const key = `${network}-${tokenBalance.contractAddress.toLowerCase()}`;
        balanceMap.set(key, Number(tokenBalance.tokenBalance as `0x${string}`).toString());
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

    return {
      ...nativeToken,
      balance: multiplyByPowerOfTen(Big(balance.value.toString()), -balance.decimals).toFixed(4, 0)
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
        balance: "0.0000"
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
          balance: formattedBalance
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

        const tokenAddresses = networkTokens.map(token => token.erc20AddressSourceChain).filter(addr => addr);

        if (tokenAddresses.length > 0) {
          try {
            const balances = await fetchAlchemyTokenBalances(address, tokenAddresses, network);
            console.log(`[${network}] Balances:`, Object.fromEntries(balances));

            // Merge balances into the allBalances map
            balances.forEach((value, key) => {
              allBalances.set(key, value);
            });
          } catch (error) {
            console.error(`Failed to fetch ${network} balances:`, error);
          }
        }
      }

      setBalanceMap(allBalances);
    };

    fetchAllBalances();
  }, [address, tokensByNetwork]); // - run when address or tokens change

  // Create a flat list of all tokens with their balances
  const tokensWithBalances = tokens.reduce<Array<EvmTokenDetailsWithBalance>>((prev, curr, index) => {
    const key = `${curr.network}-${curr.erc20AddressSourceChain?.toLowerCase()}`;
    const tokenBalance = balanceMap.get(key);

    // If we are dealing with a stablecoin, we show 2 decimals, otherwise 4
    const showDecimals = curr.assetSymbol.toLowerCase().includes("usd") ? 2 : 4;
    const balance = tokenBalance
      ? multiplyByPowerOfTen(Big(tokenBalance.toString()), -curr.decimals).toFixed(showDecimals, 0)
      : "0.00";

    prev.push({
      ...curr,
      balance
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
      setBalances(assetTokens.map(token => ({ ...token, balance: "0.00" })));
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

        return { ...token, balance };
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
