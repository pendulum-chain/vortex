import BigNumber from 'big.js';
import { activeOptions, cacheKeys } from '../../constants/cache';
import { routerAbi } from '../../contracts/Router';
import {
  ContractBalance,
  multiplyByPowerOfTen,
  parseContractBalanceResponse,
  stringifyBigWithSignificantDecimals,
} from '../../helpers/contracts';
import { NABLA_ROUTER } from '../../constants/constants';
import { useContractRead } from './useContractRead';
import { UseQueryResult } from '@tanstack/react-query';
import { useDebouncedValue } from '../useDebouncedValue';
import { TOKEN_CONFIG } from '../../constants/tokenConfig';
import { WalletAccount } from '@talismn/connect-wallets';
import { ApiPromise } from '../../services/polkadot/polkadotApi';
import { FieldValues, UseFormReturn } from 'react-hook-form';
import { useEffect } from 'preact/hooks';
import Big from 'big.js';

export type UseTokenOutAmountProps<FormFieldValues extends FieldValues> = {
  wantsSwap: boolean;
  api: ApiPromise | null;
  walletAccount: WalletAccount | undefined;
  fromAmountString: string;
  fromToken: string;
  toToken: string;
  maximumFromAmount: BigNumber | undefined;
  slippageBasisPoints: number;
  form: UseFormReturn<FormFieldValues>;
};

export interface UseTokenOutAmountResult {
  isLoading: boolean;
  enabled: boolean;
  data: TokenOutData | undefined;
  refetch?: UseQueryResult<TokenOutData | undefined, string>['refetch'];
}

export interface TokenOutData {
  amountOut: ContractBalance;
  swapFee: ContractBalance;
  effectiveExchangeRate: string;
}

export function useTokenOutAmount<FormFieldValues extends FieldValues>({
  wantsSwap,
  api,
  walletAccount,
  fromAmountString,
  fromToken,
  toToken,
  maximumFromAmount,
  slippageBasisPoints,
  form,
}: UseTokenOutAmountProps<FormFieldValues>) {
  const { setError, clearErrors } = form;

  const debouncedFromAmountString = useDebouncedValue(fromAmountString, 800);
  let debouncedAmountBigDecimal: Big | undefined;
  try {
    debouncedAmountBigDecimal = new Big(debouncedFromAmountString);
  } catch {
    // no action required
  }

  const fromTokenDetails = TOKEN_CONFIG[fromToken];
  const toTokenDetails = TOKEN_CONFIG[toToken];

  const fromTokenDecimals = fromTokenDetails?.decimals;

  const amountIn =
    fromTokenDecimals !== undefined && debouncedAmountBigDecimal !== undefined
      ? multiplyByPowerOfTen(debouncedAmountBigDecimal, fromTokenDecimals).toFixed(0, 0)
      : undefined;

  const enabled =
    api !== undefined &&
    wantsSwap &&
    fromTokenDetails !== undefined &&
    toTokenDetails !== undefined &&
    walletAccount !== undefined &&
    debouncedAmountBigDecimal !== undefined &&
    debouncedAmountBigDecimal.gt(new BigNumber(0)) &&
    (maximumFromAmount === undefined || debouncedAmountBigDecimal.lte(maximumFromAmount));

  const { isLoading, fetchStatus, data, error, refetch } = useContractRead<TokenOutData | undefined>(
    [cacheKeys.tokenOutAmount, fromTokenDetails?.erc20Address, toTokenDetails?.erc20Address, amountIn],
    api,
    walletAccount?.address,
    {
      abi: routerAbi,
      address: NABLA_ROUTER,
      method: 'getAmountOut',
      args: [amountIn, [fromTokenDetails?.erc20Address, toTokenDetails?.erc20Address]],
      noWalletAddressRequired: true,
      queryOptions: {
        ...activeOptions['30s'],
        enabled,
      },
      parseSuccessOutput: (data) => {
        if (toTokenDetails === undefined || fromTokenDetails === undefined || debouncedAmountBigDecimal === undefined) {
          return undefined;
        }

        const bigIntResponse = data[0]?.toBigInt();
        const reducedResponse = (bigIntResponse * BigInt(10000 - slippageBasisPoints)) / 10000n;

        const amountOut = parseContractBalanceResponse(toTokenDetails.decimals, reducedResponse);
        const swapFee = parseContractBalanceResponse(toTokenDetails.decimals, data[1]);

        return {
          amountOut,
          effectiveExchangeRate: stringifyBigWithSignificantDecimals(
            amountOut.preciseBigDecimal.div(debouncedAmountBigDecimal),
            4,
          ),
          swapFee,
        };
      },
      parseError: (error) => {
        switch (error.type) {
          case 'error':
            return 'Something went wrong';
          case 'panic':
            return error.errorCode === 0x11 ? 'The input amount is too large' : 'Something went wrong';
          case 'reverted':
            return error.description === 'SwapPool: EXCEEDS_MAX_COVERAGE_RATIO'
              ? 'The input amount is too large'
              : 'Something went wrong';
          default:
            return 'Something went wrong';
        }
      },
    },
  );

  const pending = (isLoading && fetchStatus !== 'idle') || debouncedFromAmountString !== fromAmountString;
  useEffect(() => {
    if (pending) return;
    if (error === null) {
      clearErrors('root');
    } else {
      setError('root', { type: 'custom', message: error });
    }
  }, [error, pending, clearErrors, setError]);

  return { isLoading: pending, enabled, data, refetch };
}
