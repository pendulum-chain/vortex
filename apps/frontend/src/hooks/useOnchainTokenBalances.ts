import {
  AssetHubTokenDetails,
  AssetHubTokenDetailsWithBalance,
  assethubTokenConfig,
  EvmTokenDetails,
  EvmTokenDetailsWithBalance,
  evmTokenConfig,
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
import { useVortexAccount } from "./useVortexAccount";

export const useEvmNativeBalance = (): EvmTokenDetailsWithBalance | null => {
  const { evmAddress: address } = useVortexAccount();
  const { selectedNetwork } = useNetwork();
  const chainId = getNetworkId(selectedNetwork);

  const tokensForNetwork: EvmTokenDetails[] = useMemo(() => {
    if (isNetworkEVM(selectedNetwork)) {
      return Object.values(evmTokenConfig[selectedNetwork] ?? {});
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
    const assethubTokens = Object.values(assethubTokenConfig);
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

  const tokensByNetwork = useMemo(() => groupTokensByNetwork(tokens), [tokens]);

  // Create contract calls for all networks
  const contractCalls = useMemo(() => {
    return Object.entries(tokensByNetwork).flatMap(([network, networkTokens]) => {
      const chainId = getNetworkId(network as Networks);
      return networkTokens.map(token => ({
        abi: erc20ABI as Abi,
        address: token.erc20AddressSourceChain,
        args: [address],
        chainId,
        functionName: "balanceOf"
      }));
    });
  }, [tokensByNetwork, address]);

  const { data: balances } = useReadContracts({
    contracts: contractCalls ?? []
  });

  if (!tokens.length || !balances) {
    return [];
  }

  // Create a flat list of all tokens with their balances
  const tokensWithBalances = tokens.reduce<Array<EvmTokenDetailsWithBalance>>((prev, curr, index) => {
    const tokenBalance = balances[index]?.result;

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
