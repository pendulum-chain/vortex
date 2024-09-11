import BigNumber from 'big.js';
import Big from 'big.js';
import { UseQueryResult } from '@tanstack/react-query';
import { UseFormReturn } from 'react-hook-form';
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
import { useDebouncedValue } from '../useDebouncedValue';
import { ApiPromise } from '../../services/polkadot/polkadotApi';
import { useEffect } from 'preact/hooks';
import { INPUT_TOKEN_CONFIG, InputTokenType, OUTPUT_TOKEN_CONFIG, OutputTokenType } from '../../constants/tokenConfig';
import { SwapFormValues } from '../../components/Nabla/schema';

type UseTokenOutAmountProps = {
  wantsSwap: boolean;
  api: ApiPromise | null;
  fromAmountString: string;
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  maximumFromAmount: BigNumber | undefined;
  form: UseFormReturn<SwapFormValues>;
};

export interface UseTokenOutAmountResult {
  isLoading: boolean;
  enabled: boolean;
  data: TokenOutData | undefined | null;
  refetch?: UseQueryResult<TokenOutData | null, string>['refetch'];
}

interface TokenOutData {
  amountOut: ContractBalance;
  swapFee: ContractBalance;
  effectiveExchangeRate: string;
}

export function useTokenOutAmount({
  wantsSwap,
  api,
  fromAmountString,
  inputTokenType,
  outputTokenType,
  maximumFromAmount,
  form,
}: UseTokenOutAmountProps) {
  const { setError, clearErrors } = form;

  const debouncedFromAmountString = useDebouncedValue(fromAmountString, 800);
  let debouncedAmountBigDecimal: Big | undefined;
  try {
    debouncedAmountBigDecimal = new Big(debouncedFromAmountString);
  } catch {
    // no action required
  }

  const inputToken = INPUT_TOKEN_CONFIG[inputTokenType];
  const outputToken = OUTPUT_TOKEN_CONFIG[outputTokenType];

  const fromTokenDecimals = inputToken?.decimals;

  const amountIn =
    fromTokenDecimals !== undefined && debouncedAmountBigDecimal !== undefined
      ? multiplyByPowerOfTen(debouncedAmountBigDecimal, fromTokenDecimals).toFixed(0, 0)
      : undefined;

  const enabled =
    api !== undefined &&
    wantsSwap &&
    inputToken !== undefined &&
    outputToken !== undefined &&
    debouncedAmountBigDecimal !== undefined &&
    debouncedAmountBigDecimal.gt(new BigNumber(0)) &&
    (maximumFromAmount === undefined || debouncedAmountBigDecimal.lte(maximumFromAmount));

  const { isLoading, fetchStatus, data, error, refetch } = useContractRead<TokenOutData | null>(
    [
      cacheKeys.tokenOutAmount,
      inputToken.axelarEquivalent.pendulumErc20WrapperAddress,
      outputToken.erc20WrapperAddress,
      amountIn,
    ],
    api,
    undefined, // Does not matter since noWalletAddressRequired is true
    {
      abi: routerAbi,
      address: NABLA_ROUTER,
      method: 'getAmountOut',
      args: [amountIn, [inputToken.axelarEquivalent.pendulumErc20WrapperAddress, outputToken.erc20WrapperAddress]],
      noWalletAddressRequired: true,
      queryOptions: {
        ...activeOptions['30s'],
        enabled,
      },
      parseSuccessOutput: (data) => {
        if (outputToken === undefined || inputToken === undefined || debouncedAmountBigDecimal === undefined) {
          return null;
        }

        const amountOut = parseContractBalanceResponse(outputToken.decimals, data[0]);
        const swapFee = parseContractBalanceResponse(outputToken.decimals, data[1]);

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
            return error.errorCode === 0x11
              ? 'Insufficient liquidity for this exchange. Please try a smaller amount or try again later.'
              : 'Something went wrong';
          case 'reverted':
            return error.description === 'SwapPool: EXCEEDS_MAX_COVERAGE_RATIO'
              ? 'Insufficient liquidity for this exchange. Please try a smaller amount or try again later.'
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

  const isInputStable = debouncedFromAmountString === fromAmountString;
  const stableAmountInUnits = isInputStable ? debouncedFromAmountString : undefined;

  return { isLoading: pending, enabled, data, refetch, error, stableAmountInUnits };
}
