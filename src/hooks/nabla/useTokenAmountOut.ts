import BigNumber from 'big.js';
import { activeOptions, cacheKeys } from '../../constants/cache';
import { routerAbi } from '../../contracts/Router';
import { ContractBalance, parseContractBalanceResponse } from '../../helpers/contracts';
import { decimalToCustom, toBigNumber } from '../../helpers/parseNumbers';
import { NABLA_ROUTER } from '../../constants/constants';
import { useContractRead } from './useContractRead';
import { UseQueryResult } from '@tanstack/react-query';
import { TokenDetails } from '../../constants/tokenConfig';
import { useDebouncedValue } from '../useDebouncedValue';
import { TOKEN_CONFIG } from '../../constants/tokenConfig';
import { WalletAccount } from '@talismn/connect-wallets';
import { ApiPromise } from '../../services/polkadot/polkadotApi';
import { FieldValues, UseFormReturn } from 'react-hook-form';
import { useEffect } from 'preact/hooks';

export type UseTokenOutAmountProps<FormFieldValues extends FieldValues> = {
  wantsSwap: boolean;
  api: ApiPromise | null;
  walletAccount: WalletAccount | undefined;
  fromAmount: number | null;
  fromToken: string;
  toToken: string;
  maximumFromAmount: BigNumber | undefined;
  slippage: number;
  form: UseFormReturn<FormFieldValues>;
};

export interface UseTokenOutAmountResult {
  isLoading: boolean;
  enabled: boolean;
  data: TokenOutData | undefined;
  error: string | null;
  refetch?: UseQueryResult<TokenOutData | undefined, string>['refetch'];
}
export interface TokenOutData {
  amountOut: ContractBalance;
  swapFee: ContractBalance;
  effectiveExchangeRate: string;
  minAmountOut: string;
}

export function useTokenOutAmount<FormFieldValues extends FieldValues>({
  wantsSwap,
  api,
  walletAccount,
  fromAmount,
  fromToken,
  toToken,
  maximumFromAmount,
  slippage,
  form,
}: UseTokenOutAmountProps<FormFieldValues>) {
  const { setError, clearErrors } = form;
  const debouncedFromAmount = useDebouncedValue(fromAmount, 800);

  // Handle different errors either from form or parameters needed for the swap
  const inputHasErrors = form.formState.errors.fromAmount?.message !== undefined;
  if (inputHasErrors) {
    console.log('errors', form.formState.errors.fromAmount?.message);
    return {
      isLoading: false,
      enabled: false,
      data: undefined,
      error: form.formState.errors.fromAmount?.message ?? 'The specified swap cannot be performed at the moment',
      refetch: undefined,
    };
  }

  if (!walletAccount) {
    return { isLoading: false, enabled: false, data: undefined, error: 'Wallet not connected', refetch: undefined };
  }

  if (fromToken === '' || toToken === '' || fromAmount === null || api === null || !wantsSwap) {
    return {
      isLoading: false,
      enabled: false,
      data: undefined,
      error: '',
      refetch: undefined,
    };
  }

  const fromTokenDetails: TokenDetails = TOKEN_CONFIG[fromToken];
  const toTokenDetails: TokenDetails = TOKEN_CONFIG[toToken];

  const debouncedAmountBigDecimal = decimalToCustom((debouncedFromAmount || '').toString(), fromTokenDetails.decimals);

  // Even though we check for errors, due to possible delay in value update we need to check that the value is not
  // less than 1, or larger than e+20, since BigNumber.toString() will return scientific notation.
  // this is no error, but temporary empty return until the value gets properly updated.
  if (
    debouncedAmountBigDecimal === undefined ||
    debouncedAmountBigDecimal.lt(new BigNumber(1)) ||
    debouncedAmountBigDecimal.e > 20
  ) {
    return { isLoading: false, enabled: false, data: undefined, error: '', refetch: undefined };
  }

  const enabled =
    fromToken !== undefined &&
    toToken !== undefined &&
    debouncedAmountBigDecimal !== undefined &&
    debouncedAmountBigDecimal.gt(new BigNumber(0)) &&
    (maximumFromAmount === undefined || debouncedAmountBigDecimal.lte(maximumFromAmount));

  const amountIn = debouncedAmountBigDecimal?.toString();

  const { isLoading, fetchStatus, data, error, refetch } = useContractRead<TokenOutData | undefined>(
    [cacheKeys.tokenOutAmount, fromTokenDetails.erc20Address, toTokenDetails.erc20Address, amountIn],
    api,
    walletAccount.address,
    {
      abi: routerAbi,
      address: NABLA_ROUTER,
      method: 'getAmountOut',
      args: [amountIn, [fromTokenDetails.erc20Address, toTokenDetails.erc20Address]],
      noWalletAddressRequired: true,
      queryOptions: {
        ...activeOptions['30s'],
        enabled,
      },
      parseSuccessOutput: (data) => {
        if (toToken === undefined || fromToken === undefined || debouncedAmountBigDecimal === undefined) {
          return undefined;
        }
        const amountOut = parseContractBalanceResponse(toTokenDetails.decimals, data[0]);
        const swapFee = parseContractBalanceResponse(toTokenDetails.decimals, data[1]);

        //
        const decimalDifference = fromTokenDetails.decimals - toTokenDetails.decimals;
        let effectiveExchangeRate;
        if (decimalDifference > 0) {
          const decimalDiffCorrection = new BigNumber(10).pow(decimalDifference);
          effectiveExchangeRate = amountOut.rawBalance
            .div(debouncedAmountBigDecimal)
            .mul(decimalDiffCorrection)
            .toString();
        } else {
          const decimalDiffCorrection = new BigNumber(10).pow(-decimalDifference);
          effectiveExchangeRate = amountOut.rawBalance
            .div(debouncedAmountBigDecimal.mul(decimalDiffCorrection))
            .toString();
        }

        const minAmountOut = amountOut.approximateNumber * (1 - slippage / 100);

        return {
          amountOut,
          effectiveExchangeRate,
          swapFee,
          minAmountOut: minAmountOut.toString(),
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

  const pending = (isLoading && fetchStatus !== 'idle') || debouncedFromAmount !== fromAmount;
  useEffect(() => {
    if (pending) return;
    if (error === null) {
      clearErrors('root');
    } else {
      setError('root', { type: 'custom', message: error });
    }
  }, [error, pending, clearErrors, setError]);

  return { isLoading: pending, enabled, data, error, refetch };
}
