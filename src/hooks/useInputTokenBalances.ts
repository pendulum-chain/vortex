import { useState, useEffect } from 'react';
import { useReadContracts } from 'wagmi';
import { Abi } from 'viem';
import Big from 'big.js';

import {
  EvmInputTokenDetails,
  isEvmInputTokenDetails,
  InputTokenDetails,
  SubstrateInputTokenDetails,
  isSubstrateInputTokenDetails,
  EvmInputTokenDetailsWithBalance,
  SubstrateInputTokenDetailsWithBalance,
  InputTokenDetailsWithBalance,
} from '../constants/tokenConfig';
import { useVortexAccount } from './useVortexAccount';
import { getNetworkId } from '../helpers/networks';
import { useNetwork } from '../contexts/network';
import erc20ABI from '../contracts/ERC20';
import { multiplyByPowerOfTen } from '../helpers/contracts';
import { usePolkadotWalletState } from '../contexts/polkadotWallet';
import { useAssetHubNode } from '../contexts/polkadotNode';
import { nativeToDecimal } from '../helpers/parseNumbers';

export const useEvmBalances = (tokens: EvmInputTokenDetails[]): EvmInputTokenDetailsWithBalance[] => {
  const { address } = useVortexAccount();
  const { selectedNetwork } = useNetwork();
  const chainId = getNetworkId(selectedNetwork);

  console.log('tokens', tokens);

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

  console.log('balances: ', balances);

  if (!tokens.length || !balances) {
    return [];
  }

  const tokensWithBalances = tokens.reduce<Array<EvmInputTokenDetails & { balance: string }>>((prev, curr, index) => {
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

export const useAssetHubBalances = (tokens: SubstrateInputTokenDetails[]): SubstrateInputTokenDetailsWithBalance[] => {
  const [balances, setBalances] = useState<Array<SubstrateInputTokenDetailsWithBalance>>([]);
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

        const { minBalance: rawMinBalance } = assetInfo.toJSON() as { minBalance: number };

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

export const useInputTokenBalances = (tokens: InputTokenDetails[]): InputTokenDetailsWithBalance[] => {
  const evmTokens = tokens.filter(isEvmInputTokenDetails) as EvmInputTokenDetails[];
  const substrateTokens = tokens.filter(isSubstrateInputTokenDetails) as SubstrateInputTokenDetails[];
  const evmBalances = useEvmBalances(evmTokens);
  const substrateBalances = useAssetHubBalances(substrateTokens);

  return evmBalances.length ? evmBalances : substrateBalances;
};
