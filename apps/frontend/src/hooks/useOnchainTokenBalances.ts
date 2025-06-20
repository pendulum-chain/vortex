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
  Networks,
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

// Hook to get EVM native token balance
export const useEvmNativeBalance = (nativeToken: EvmTokenDetails | undefined): EvmTokenDetailsWithBalance | null => {
  const { address } = useVortexAccount();
  const { selectedNetwork } = useNetwork();
  const chainId = getNetworkId(selectedNetwork);

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

// Hook to get AssetHub native DOT balance
export const useAssetHubNativeBalance = (
  nativeToken: AssetHubTokenDetails | undefined
): AssetHubTokenDetailsWithBalance | null => {
  const [nativeBalance, setNativeBalance] = useState<AssetHubTokenDetailsWithBalance | null>(null);
  const { walletAccount } = usePolkadotWalletState();
  const { apiComponents: assetHubNode } = useAssetHubNode();
  const { selectedNetwork } = useNetwork();

  useEffect(() => {
    if (!nativeToken || !walletAccount || !assetHubNode || selectedNetwork !== "assethub") {
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
        const formattedBalance = nativeToDecimal(freeBalance, -nativeToken.decimals).toFixed(4, 0).toString();

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
  }, [assetHubNode, walletAccount, selectedNetwork, nativeToken]);

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

export const useOnchainTokenBalances = (
  tokens: (FiatTokenDetails | OnChainTokenDetails)[]
): OnChainTokenDetailsWithBalance[] => {
  const { selectedNetwork } = useNetwork();

  const evmTokens = useMemo(() => tokens.filter(isEvmTokenDetails) as EvmTokenDetailsWithBalance[], [tokens]);
  const nativeEvmToken = useMemo(() => evmTokens.find(token => token.isNative), [evmTokens]);
  const substrateTokens = useMemo(() => tokens.filter(isAssetHubTokenDetails) as AssetHubTokenDetailsWithBalance[], [tokens]);
  const nativeSubstrateToken = useMemo(() => substrateTokens.find(token => token.isNative), [substrateTokens]);

  const evmBalances = useEvmBalances(evmTokens);
  const substrateBalances = useAssetHubBalances(substrateTokens);
  const evmNativeBalance = useEvmNativeBalance(nativeEvmToken);
  const assetHubNativeBalance = useAssetHubNativeBalance(nativeSubstrateToken);

  return useMemo(() => {
    const tokenBalances: OnChainTokenDetailsWithBalance[] = evmBalances.length ? evmBalances : substrateBalances;

    // Add native token balance based on the selected network
    if (isNetworkEVM(selectedNetwork) && evmNativeBalance) {
      return [evmNativeBalance, ...tokenBalances];
    } else if (selectedNetwork === Networks.AssetHub && assetHubNativeBalance) {
      return [assetHubNativeBalance, ...tokenBalances];
    }

    return tokenBalances;
  }, [evmBalances, substrateBalances, evmNativeBalance, assetHubNativeBalance, selectedNetwork]);
};
