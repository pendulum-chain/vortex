import { useAccount, useReadContract } from 'wagmi';

import erc20ABI from '../contracts/ERC20';
import { InputTokenDetails, isEvmInputTokenDetails } from '../constants/tokenConfig';
import { multiplyByPowerOfTen } from '../helpers/contracts';
import Big from 'big.js';

export const useInputTokenBalance = ({ fromToken }: { fromToken?: InputTokenDetails }): string | undefined => {
  const { address } = useAccount();

  const tokenAddress =
    fromToken !== undefined && isEvmInputTokenDetails(fromToken) ? fromToken.erc20AddressSourceChain : undefined;

  const { data: balance }: { data: bigint | undefined } = useReadContract({
    address: tokenAddress,
    abi: erc20ABI,
    functionName: 'balanceOf',
    args: [address],
  });

  return address === undefined || balance === undefined || fromToken === undefined
    ? undefined
    : multiplyByPowerOfTen(Big(balance.toString()), -fromToken.decimals).toFixed(2, 0);
};
