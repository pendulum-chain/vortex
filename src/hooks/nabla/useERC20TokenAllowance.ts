import { erc20WrapperAbi } from '../../contracts/ERC20Wrapper'
import { activeOptions, cacheKeys } from '../../constants/cache';
import { useContractRead } from './useContractRead';
import { ContractBalance, parseContractBalanceResponse } from '../../helpers/contracts'
import { ApiPromise } from '@polkadot/api';

export type UseTokenAllowance = {
  api: ApiPromise;
  /** contract/token address */
  token: string;
  /** spender address */
  spender: string | undefined;
  /** owner address */
  owner: string ;
  decimals: number;
};

export function useErc20TokenAllowance({ api, token, owner, spender, decimals }: UseTokenAllowance, enabled: boolean) {
  const isEnabled = Boolean(owner && spender && enabled);

  return useContractRead<ContractBalance | undefined>(
    [cacheKeys.tokenAllowance, spender, token, owner],
    api,
    owner,
    {
      abi: erc20WrapperAbi,
      address: token,
      method: 'allowance',
      args: [owner, spender],
      queryOptions: {
        ...activeOptions['3m'],
        enabled: isEnabled,
      },
      parseSuccessOutput: parseContractBalanceResponse.bind(null, decimals),
      parseError: 'Could not load token allowance',
  });
}