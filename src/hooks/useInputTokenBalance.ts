import { InputTokenDetails, InputTokenDetailsWithBalance } from '../constants/tokenConfig';
import { useInputTokenBalances } from './useInputTokenBalances';

export const useInputTokenBalance = ({ fromToken }: { fromToken: InputTokenDetails }): InputTokenDetailsWithBalance => {
  const balances = useInputTokenBalances([fromToken]);
  return balances[0];
};

export function getInputTokenBalance(token?: InputTokenDetailsWithBalance): string {
  return token?.balance ?? '0';
}
