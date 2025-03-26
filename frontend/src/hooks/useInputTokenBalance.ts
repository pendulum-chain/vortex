import { useReadContract } from 'wagmi';
import { useEffect, useState } from 'react';
import Big from 'big.js';

import erc20ABI from '../contracts/ERC20';
import { OnChainTokenDetails, TokenType } from '../constants/tokenConfig';
import { multiplyByPowerOfTen } from '../helpers/contracts';
import { nativeToDecimal, USDC_DECIMALS } from '../helpers/parseNumbers';
import { usePolkadotWalletState } from '../contexts/polkadotWallet';
import { useAssetHubNode } from '../contexts/polkadotNode';
import { useVortexAccount } from './useVortexAccount';
import { useNetwork } from '../contexts/network';
import { getNetworkId } from '../helpers/networks';

const useEvmBalance = (
  tokenAddress: `0x${string}` | undefined,
  fromToken: OnChainTokenDetails | undefined,
): string | undefined => {
  const { address } = useVortexAccount();
  const { selectedNetwork } = useNetwork();

  const { data: balance } = useReadContract({
    address: tokenAddress,
    abi: erc20ABI,
    functionName: 'balanceOf',
    args: [address],
    chainId: getNetworkId(selectedNetwork),
  });
  if (!fromToken || (!balance && balance !== BigInt(0))) return undefined;
  return multiplyByPowerOfTen(Big(balance.toString()), -fromToken.decimals).toFixed(2, 0);
};

const useAssetHubBalance = (assetId?: number): string | undefined => {
  const [balance, setBalance] = useState<string>();
  const { walletAccount } = usePolkadotWalletState();
  const { apiComponents: assetHubNode } = useAssetHubNode();

  useEffect(() => {
    if (!walletAccount || !assetHubNode) return;

    if (!assetId) {
      setBalance('0');
      return;
    }

    const getBalance = async () => {
      try {
        const { api } = assetHubNode;
        const assetInfo = await api.query.assets.asset(assetId);
        const { minBalance: rawMinBalance } = assetInfo.toJSON() as { minBalance: number };

        const accountInfo = await api.query.assets.account(assetId, walletAccount.address);

        const rawBalance = (accountInfo.toJSON() as { balance?: number })?.balance ?? 0;

        const offrampableBalance = rawBalance > 0 ? rawBalance - rawMinBalance : 0;
        const formattedBalance = nativeToDecimal(offrampableBalance, USDC_DECIMALS).toFixed(2, 0).toString();
        setBalance(formattedBalance);
      } catch (error) {
        console.error('Failed to fetch AssetHub balance:', error);
      }
    };

    getBalance();
  }, [assetHubNode, assetId, walletAccount]);

  return balance;
};

export const useInputTokenBalance = ({ fromToken }: { fromToken?: OnChainTokenDetails }): string | undefined => {
  const isEvmToken = fromToken && fromToken.type === TokenType.Evm;

  const tokenAddress = fromToken && fromToken.type === TokenType.Evm ? fromToken.erc20AddressSourceChain : undefined;
  const evmBalance = useEvmBalance(tokenAddress, fromToken);
  const assetHubBalance = useAssetHubBalance(
    fromToken && fromToken.type === TokenType.AssetHub ? fromToken?.foreignAssetId : undefined,
  );

  if (!fromToken) {
    return undefined;
  }

  return isEvmToken ? evmBalance : assetHubBalance;
};
