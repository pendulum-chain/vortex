import Big from 'big.js';
import { useEffect, useMemo, useState } from 'react';
import { Abi } from 'viem';
import { useReadContracts } from 'wagmi';

import {
  AssetHubTokenDetails,
  AssetHubTokenDetailsWithBalance,
  EvmTokenDetails,
  EvmTokenDetailsWithBalance,
  FiatTokenDetails,
  OnChainTokenDetails,
  OnChainTokenDetailsWithBalance,
  getNetworkId,
  isAssetHubTokenDetails,
  isEvmTokenDetails,
  nativeToDecimal,
} from '@packages/shared';

import { useNetwork } from '../contexts/network';
import { useAssetHubNode } from '../contexts/polkadotNode';
import { usePolkadotWalletState } from '../contexts/polkadotWallet';
import erc20ABI from '../contracts/ERC20';
import { multiplyByPowerOfTen } from '../helpers/contracts';
import { useVortexAccount } from './useVortexAccount';

export const useEvmBalances = (tokens: EvmTokenDetails[]): EvmTokenDetailsWithBalance[] => {
  const { address } = useVortexAccount();
  const { selectedNetwork } = useNetwork();
  const chainId = getNetworkId(selectedNetwork);

  const { data: balances } = useReadContracts({
    contracts:
      tokens.map((token) => ({
        address: token.erc20AddressSourceChain,
        abi: erc20ABI as Abi,
        functionName: 'balanceOf',
        args: [address],
        chainId,
      })) ?? [],
  });

  if (!tokens.length || !balances) {
    return [];
  }

  const tokensWithBalances = tokens.reduce<Array<EvmTokenDetailsWithBalance>>((prev, curr, index) => {
    const tokenBalance = balances[index]?.result;

    const balance = tokenBalance
      ? multiplyByPowerOfTen(Big(tokenBalance.toString()), -curr.decimals).toFixed(2, 0)
      : '0.00';

    prev.push({
      ...curr,
      balance,
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

      const assetIds = tokens.map((token) => token.foreignAssetId).filter(Boolean);
      const assetInfos = await api.query.assets.asset.multi(assetIds);

      const accountQueries = assetIds.map((assetId) => [assetId, walletAccount.address]);
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
  tokens: (FiatTokenDetails | OnChainTokenDetails)[],
): OnChainTokenDetailsWithBalance[] => {
  const evmTokens = useMemo(() => tokens.filter(isEvmTokenDetails) as EvmTokenDetailsWithBalance[], [tokens]);
  const substrateTokens = useMemo(
    () => tokens.filter(isAssetHubTokenDetails) as AssetHubTokenDetailsWithBalance[],
    [tokens],
  );
  const evmBalances = useEvmBalances(evmTokens);
  const substrateBalances = useAssetHubBalances(substrateTokens);

  return evmBalances.length ? evmBalances : substrateBalances;
};
