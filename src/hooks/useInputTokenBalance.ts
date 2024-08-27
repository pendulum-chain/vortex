import { useAccount, useReadContract } from 'wagmi';

import erc20ABI from '../contracts/ERC20';
import { InputTokenDetails } from '../constants/tokenConfig';
import { multiplyByPowerOfTen } from '../helpers/contracts';
import Big from 'big.js';

export const useInputTokenBalance = ({ fromToken }: { fromToken: InputTokenDetails }): string | undefined => {
  const { address } = useAccount();

  const { data: balance }: { data: bigint | undefined } = useReadContract({
    address: fromToken.erc20AddressSourceChain,
    abi: erc20ABI,
    functionName: 'balanceOf',
    args: [address],
  });

  return address === undefined || balance === undefined
    ? undefined
    : multiplyByPowerOfTen(Big(balance.toString()), -fromToken.decimals).toFixed(2, 0);
};
