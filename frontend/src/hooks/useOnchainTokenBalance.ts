import { useMemo } from 'react';
import { useOnchainTokenBalances } from './useOnchainTokenBalances';
import { OnChainTokenDetailsWithBalance, OnChainTokenDetails } from 'shared';

export const useInputTokenBalance = ({ fromToken }: { fromToken: OnChainTokenDetails }): OnChainTokenDetailsWithBalance => {
  const tokens = useMemo(() => [fromToken], [fromToken]);
  const balances = useOnchainTokenBalances(tokens);
  return balances[0];
};

export function getInputTokenBalance(token?: OnChainTokenDetailsWithBalance): string {
  return token?.balance ?? '0';
}
