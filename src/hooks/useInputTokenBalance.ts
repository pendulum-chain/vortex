import { useAccount, useReadContract } from 'wagmi';
import { useEffect, useState } from 'preact/hooks';
import Big from 'big.js';

import erc20ABI from '../contracts/ERC20';
import { ASSETHUB_USDC_ID, InputTokenDetails, isEvmInputTokenDetails } from '../constants/tokenConfig';
import { multiplyByPowerOfTen } from '../helpers/contracts';
import { nativeToDecimal, USDC_DECIMALS } from '../helpers/parseNumbers';
import { usePolkadotWalletState } from '../contexts/polkadotWallet';
import { usePolkadotNode } from '../contexts/polkadotNode';

const useEvmBalance = (
  tokenAddress: `0x${string}` | undefined,
  fromToken: InputTokenDetails | undefined,
): string | undefined => {
  const { address } = useAccount();

  const { data: balance } = useReadContract({
    address: tokenAddress,
    abi: erc20ABI,
    functionName: 'balanceOf',
    args: [address],
  });

  if (!fromToken || !balance) return undefined;
  return multiplyByPowerOfTen(Big(balance.toString()), -fromToken.decimals).toFixed(2, 0);
};

const useAssetHubBalance = (): string | undefined => {
  const [balance, setBalance] = useState<string>();
  const { walletAccount } = usePolkadotWalletState();
  const { api } = usePolkadotNode();

  useEffect(() => {
    if (!walletAccount || !api) return;

    const getBalance = async () => {
      try {
        const accountInfo = await api.query.assets.account(ASSETHUB_USDC_ID, walletAccount.address);

        const rawBalance = (accountInfo.toJSON() as { balance?: number })?.balance ?? 0;
        const formattedBalance = nativeToDecimal(rawBalance, USDC_DECIMALS).toFixed(2, 0).toString();
        setBalance(formattedBalance);
      } catch (error) {
        console.error('Failed to fetch AssetHub balance:', error);
      }
    };

    getBalance();
  }, [api, walletAccount]);

  return balance;
};

export const useInputTokenBalance = ({ fromToken }: { fromToken?: InputTokenDetails }): string | undefined => {
  const tokenAddress = fromToken && isEvmInputTokenDetails(fromToken) ? fromToken.erc20AddressSourceChain : undefined;
  const evmBalance = useEvmBalance(tokenAddress, fromToken);
  const assetHubBalance = useAssetHubBalance();

  if (!fromToken) {
    return undefined;
  }

  return isEvmInputTokenDetails(fromToken) ? evmBalance : assetHubBalance;
};
