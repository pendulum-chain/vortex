import { useMemo } from 'react';
import { InputTokenDetails, InputTokenDetailsWithBalance } from '../constants/tokenConfig';
import { useInputTokenBalances } from './useInputTokenBalances';

export const useInputTokenBalance = ({ fromToken }: { fromToken: InputTokenDetails }): InputTokenDetailsWithBalance => {
  const tokens = useMemo(() => [fromToken], [fromToken]);
  const balances = useInputTokenBalances(tokens);
  return balances[0];
};

export function getInputTokenBalance(token?: InputTokenDetailsWithBalance): string {
  return token?.balance ?? '0';
}
