import {
  AssetHubTokenDetails,
  AssetHubTokenDetailsWithBalance,
  EvmTokenDetails,
  EvmTokenDetailsWithBalance,
  FiatTokenDetails,
  getNetworkId,
  isAssetHubTokenDetails,
  isEvmTokenDetails,
  isNetworkEVM,
  nativeToDecimal,
  OnChainTokenDetails,
  OnChainTokenDetailsWithBalance
} from "@packages/shared";
import Big from "big.js";
import { useEffect, useMemo, useState } from "react";
import { Abi } from "viem";
import { useBalance, useReadContracts } from "wagmi";

import { useNetwork } from "../contexts/network";
import { useAssetHubNode } from "../contexts/polkadotNode";
import { usePolkadotWalletState } from "../contexts/polkadotWallet";
import erc20ABI from "../contracts/ERC20";
import { multiplyByPowerOfTen } from "../helpers/contracts";
import { useVortexAccount } from "./useVortexAccount";

// Native token details type
interface NativeTokenDetails {
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  isNative: true;
}

// Extended type that includes native tokens
export type TokenDetailsWithBalance = OnChainTokenDetailsWithBalance | NativeTokenDetails;

// Type guard to check if a token is a native token
export function isNativeTokenDetails(token: TokenDetailsWithBalance): token is NativeTokenDetails {
  return "isNative" in token && token.isNative === true;
}

// Hook to get EVM native token balance
export const useEvmNativeBalance = (): NativeTokenDetails | null => {
  const { address } = useVortexAccount();
  const { selectedNetwork } = useNetwork();
  const chainId = getNetworkId(selectedNetwork);

  const { data: balance } = useBalance({
    address: address as `0x${string}`,
    chainId: isNetworkEVM(selectedNetwork) ? chainId : undefined,
    query: {
      enabled: !!address && isNetworkEVM(selectedNetwork)
    }
  });

  return useMemo(() => {
    if (!balance || !isNetworkEVM(selectedNetwork)) return null;

    return {
      balance: balance.formatted,
      decimals: balance.decimals,
      isNative: true as const,
      name: balance.symbol,
      symbol: balance.symbol
    };
  }, [balance, selectedNetwork]);
};

// Hook to get AssetHub native DOT balance
export const useAssetHubNativeBalance = (): NativeTokenDetails | null => {
  const [nativeBalance, setNativeBalance] = useState<NativeTokenDetails | null>(null);
  const { walletAccount } = usePolkadotWalletState();
  const { apiComponents: assetHubNode } = useAssetHubNode();
  const { selectedNetwork } = useNetwork();

  useEffect(() => {
    if (!walletAccount || !assetHubNode || selectedNetwork !== "assethub") {
      setNativeBalance(null);
      return;
    }

    const getNativeBalance = async () => {
      try {
        const { api } = assetHubNode;
        const accountInfo = await api.query.system.account(walletAccount.address);
        const accountData = accountInfo.toJSON() as {
          data: {
            free: number;
            reserved: number;
            frozen: number;
          };
        };

        const freeBalance = accountData.data.free || 0;
        const formattedBalance = nativeToDecimal(freeBalance, 10).toFixed(4, 0).toString();

        setNativeBalance({
          balance: formattedBalance,
          decimals: 10,
          isNative: true as const,
          name: "Polkadot",
          symbol: "DOT"
        });
      } catch (error) {
        console.error("Error fetching AssetHub native balance:", error);
        setNativeBalance(null);
      }
    };

    getNativeBalance();
  }, [assetHubNode, walletAccount, selectedNetwork]);

  return nativeBalance;
};

export const useEvmBalances = (tokens: EvmTokenDetails[]): EvmTokenDetailsWithBalance[] => {
  const { address } = useVortexAccount();
  const { selectedNetwork } = useNetwork();
  const chainId = getNetworkId(selectedNetwork);

  const { data: balances } = useReadContracts({
    contracts:
      tokens.map(token => ({
        abi: erc20ABI as Abi,
        address: token.erc20AddressSourceChain,
        args: [address],
        chainId,
        functionName: "balanceOf"
      })) ?? []
  });

  if (!tokens.length || !balances) {
    return [];
  }

  const tokensWithBalances = tokens.reduce<Array<EvmTokenDetailsWithBalance>>((prev, curr, index) => {
    const tokenBalance = balances[index]?.result;

    const balance = tokenBalance ? multiplyByPowerOfTen(Big(tokenBalance.toString()), -curr.decimals).toFixed(2, 0) : "0.00";

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
  const { walletAccount } = usePolkadotWalletState();
  const { apiComponents: assetHubNode } = useAssetHubNode();

  useEffect(() => {
    if (!walletAccount || !assetHubNode) return;

    const getBalances = async () => {
      const { api } = assetHubNode;

      const assetIds = tokens.map(token => token.foreignAssetId).filter(Boolean);
      const assetInfos = await api.query.assets.asset.multi(assetIds);

      const accountQueries = assetIds.map(assetId => [assetId, walletAccount.address]);
      const accountInfos = await api.query.assets.account.multi(accountQueries);

      const tokensWithBalances = tokens.map((token, index) => {
        const assetInfo = assetInfos[index];
        const accountInfo = accountInfos[index];

        const { minBalance: rawMinBalance } = assetInfo.toJSON() as {
          minBalance: number;
        };

        const rawBalance = (accountInfo.toJSON() as { balance?: number })?.balance ?? 0;
        const offrampableBalance = rawBalance > 0 ? rawBalance - rawMinBalance : 0;
        const formattedBalance = nativeToDecimal(offrampableBalance, token.decimals).toFixed(2, 0).toString();

        return { ...token, balance: formattedBalance };
      });

      setBalances(tokensWithBalances);
    };

    getBalances();
  }, [assetHubNode, tokens, walletAccount]);

  return balances;
};

export const useOnchainTokenBalances = (tokens: (FiatTokenDetails | OnChainTokenDetails)[]): TokenDetailsWithBalance[] => {
  const { selectedNetwork } = useNetwork();

  const evmTokens = useMemo(() => tokens.filter(isEvmTokenDetails) as EvmTokenDetailsWithBalance[], [tokens]);
  const substrateTokens = useMemo(() => tokens.filter(isAssetHubTokenDetails) as AssetHubTokenDetailsWithBalance[], [tokens]);

  const evmBalances = useEvmBalances(evmTokens);
  const substrateBalances = useAssetHubBalances(substrateTokens);
  const evmNativeBalance = useEvmNativeBalance();
  const assetHubNativeBalance = useAssetHubNativeBalance();

  return useMemo(() => {
    const tokenBalances: TokenDetailsWithBalance[] = evmBalances.length ? evmBalances : substrateBalances;

    // Add native token balance based on the selected network
    if (isNetworkEVM(selectedNetwork) && evmNativeBalance) {
      return [evmNativeBalance, ...tokenBalances];
    } else if (selectedNetwork === "assethub" && assetHubNativeBalance) {
      return [assetHubNativeBalance, ...tokenBalances];
    }

    return tokenBalances;
  }, [evmBalances, substrateBalances, evmNativeBalance, assetHubNativeBalance, selectedNetwork]);
};
