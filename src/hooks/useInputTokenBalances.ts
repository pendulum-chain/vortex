import { useReadContracts } from 'wagmi';
import { Abi } from 'viem';
import Big from 'big.js';

import { EvmInputTokenDetails, isEvmInputTokenDetails, InputTokenDetails } from '../constants/tokenConfig';
import { useVortexAccount } from './useVortexAccount';
import { getNetworkId } from '../helpers/networks';
import { useNetwork } from '../contexts/network';
import erc20ABI from '../contracts/ERC20';
import { multiplyByPowerOfTen } from '../helpers/contracts';

const useEvmBalances = (tokens: EvmInputTokenDetails[]) => {
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

export const useInputTokenBalances = (tokens: InputTokenDetails[]) => {
  const evmTokens = tokens.filter(isEvmInputTokenDetails) as EvmInputTokenDetails[];

  const evmBalances = useEvmBalances(evmTokens);

  return evmBalances;
};
