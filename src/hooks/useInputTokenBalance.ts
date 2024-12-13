import { useReadContract } from 'wagmi';
import { useEffect, useState } from 'preact/hooks';
import Big from 'big.js';

import erc20ABI from '../contracts/ERC20';
import { InputTokenDetails, isEvmInputTokenDetails } from '../constants/tokenConfig';
import { multiplyByPowerOfTen } from '../helpers/contracts';
import { nativeToDecimal, USDC_DECIMALS } from '../helpers/parseNumbers';
import { usePolkadotWalletState } from '../contexts/polkadotWallet';
import { useAssetHubNode } from '../contexts/polkadotNode';
import { useVortexAccount } from './useVortexAccount';

const useEvmBalance = (
  tokenAddress: `0x${string}` | undefined,
  fromToken: InputTokenDetails | undefined,
): string | undefined => {
  const { address, type } = useVortexAccount();

  if (type !== 'evm') {
    console.log(`Cannot fetch EVM balance for ${fromToken?.assetSymbol} from ${type} account`);
    return undefined;
  }

  const { data: balance } = useReadContract({
    address: tokenAddress,
    abi: erc20ABI,
    functionName: 'balanceOf',
    args: [address],
  });

  if (!fromToken || !balance) return undefined;
  return multiplyByPowerOfTen(Big(balance.toString()), -fromToken.decimals).toFixed(2, 0);
};

const useAssetHubBalance = (assetId?: number): string | undefined => {
  const [balance, setBalance] = useState<string>();
  const { walletAccount } = usePolkadotWalletState();
  const { apiComponents: assetHubNode } = useAssetHubNode();

  useEffect(() => {
    if (!walletAccount || !assetHubNode) return;

    if (!assetId) {
      console.log('Invalid assetId', assetId);
      setBalance('0');
      return;
    }

    const getBalance = async () => {
      try {
        const { api } = assetHubNode;
        const accountInfo = await api.query.assets.account(assetId, walletAccount.address);

        const rawBalance = (accountInfo.toJSON() as { balance?: number })?.balance ?? 0;
        const formattedBalance = nativeToDecimal(rawBalance, USDC_DECIMALS).toFixed(2, 0).toString();
        setBalance(formattedBalance);
      } catch (error) {
        console.error('Failed to fetch AssetHub balance:', error);
      }
    };

    getBalance();
  }, [assetHubNode, assetId, walletAccount]);

  return balance;
};

export const useInputTokenBalance = ({ fromToken }: { fromToken?: InputTokenDetails }): string | undefined => {
  const isEvmToken = fromToken && isEvmInputTokenDetails(fromToken);

  const tokenAddress = fromToken && isEvmInputTokenDetails(fromToken) ? fromToken.erc20AddressSourceChain : undefined;
  const evmBalance = useEvmBalance(tokenAddress, fromToken);
  const assetHubBalance = useAssetHubBalance(!isEvmToken ? fromToken?.foreignAssetId : undefined);

  if (!fromToken) {
    return undefined;
  }

  return isEvmInputTokenDetails(fromToken) ? evmBalance : assetHubBalance;
};
