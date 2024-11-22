import { useAccount, useReadContract } from 'wagmi';

import erc20ABI from '../contracts/ERC20';
import { InputTokenDetails } from '../constants/tokenConfig';
import { multiplyByPowerOfTen } from '../helpers/contracts';
import Big from 'big.js';
import { usePolkadotWalletState } from '../contexts/polkadotWallet';
import { useNetwork } from '../contexts/network';
import { Networks } from './useGetNetworkIcon';
import { usePolkadotTokenBalance } from './usePolkadotTokenBalance';

export const useInputTokenBalance = ({ fromToken }: { fromToken: InputTokenDetails }): string | undefined => {
  const { address } = useAccount();
  const { walletAccount } = usePolkadotWalletState();
  const { selectedNetwork } = useNetwork();

  const polkadotBalance = usePolkadotTokenBalance({
    address: walletAccount?.address ?? '',
    assetId: fromToken.assetHubAddress ?? '',
  });

  const { data: evmBalance }: { data: bigint | undefined } = useReadContract({
    address: fromToken.erc20AddressSourceChain,
    abi: erc20ABI,
    functionName: 'balanceOf',
    args: [address],
  });

  if (selectedNetwork === Networks.assetHub) {
    return polkadotBalance;
  }

  return address === undefined || evmBalance === undefined
    ? undefined
    : multiplyByPowerOfTen(Big(evmBalance.toString()), -fromToken.decimals).toFixed(2, 0);
};
