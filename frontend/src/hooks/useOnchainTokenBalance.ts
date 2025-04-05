import { useMemo } from 'react';
import { useOnchainTokenBalances } from './useOnchainTokenBalances';
import { OnChainTokenDetailsWithBalance, OnChainTokenDetails } from 'shared';

export const useOnchainTokenBalance = ({ token }: { token: OnChainTokenDetails }): OnChainTokenDetailsWithBalance => {
  const tokens = useMemo(() => [token], [token]);
  const balances = useOnchainTokenBalances(tokens);
  return balances[0];
};

export function getOnchainTokenBalance(token?: OnChainTokenDetailsWithBalance): string {
  return token?.balance ?? '0';
}
