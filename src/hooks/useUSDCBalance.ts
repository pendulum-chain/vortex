import { formatUnits } from 'viem';
import { useAccount, useReadContract } from 'wagmi';

import USDCPolygonABI from '../constants/abi/simplifiedERC20ABI.json';
import { INPUT_TOKEN_CONFIG, InputTokenDetails } from '../constants/tokenConfig';

export const useUSDCBalance = ({ fromToken }: { fromToken?: InputTokenDetails }) => {
  const { address } = useAccount();

  const { data: balance } = useReadContract({
    address: fromToken?.erc20AddressSourceChain || INPUT_TOKEN_CONFIG.usdc.erc20AddressSourceChain,
    abi: USDCPolygonABI,
    functionName: 'balanceOf',
    args: [address],
  });

  return balance ? formatUnits(balance as bigint, 6) : '0';
};
