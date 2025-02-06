import BigNumber from 'big.js';
import Big from 'big.js';
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
import { ApiPromise } from '@polkadot/api';
import { useEffect, useState } from 'react';
import {
  getInputTokenDetailsOrDefault,
  getOutputTokenDetails,
  InputTokenType,
  OutputTokenType,
} from '../../constants/tokenConfig';
import { Networks } from '../../helpers/networks';
import { SwapFormValues } from '../../components/Nabla/schema';
import { useEventsContext } from '../../contexts/events';

type UseTokenOutAmountProps = {
  wantsSwap: boolean;
  api: ApiPromise | null;
  fromAmountString: string;
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  maximumFromAmount: BigNumber | undefined;
  form: UseFormReturn<SwapFormValues>;
  network: Networks;
};

export interface UseTokenOutAmountResult {
  isLoading: boolean;
  enabled: boolean;
  data: TokenOutData | undefined;
  error: string | null;
  stableAmountInUnits: string | undefined;
}

export interface TokenOutData {
  preciseQuotedAmountOut: ContractBalance;
  roundedDownQuotedAmountOut: Big;
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
  network,
}: UseTokenOutAmountProps) {
  const { setError, clearErrors } = form;
  const { trackEvent } = useEventsContext();
  const [pending, setPending] = useState(true);
  const [initializing, setInitializing] = useState(true);

  const debouncedFromAmountString = useDebouncedValue(fromAmountString, 800);
  let debouncedAmountBigDecimal: Big | undefined;
  try {
    debouncedAmountBigDecimal = new Big(debouncedFromAmountString);
  } catch {
    // no action required
  }

  const inputToken = getInputTokenDetailsOrDefault(network, inputTokenType);
  const outputToken = getOutputTokenDetails(outputTokenType);

  const fromTokenDecimals = inputToken?.pendulumDecimals;

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

  const { isLoading, fetchStatus, data, error } = useContractRead<TokenOutData | undefined>(
    [cacheKeys.tokenOutAmount, inputToken.pendulumErc20WrapperAddress, outputToken.erc20WrapperAddress, amountIn],
    api,
    undefined, // Does not matter since noWalletAddressRequired is true
    {
      abi: routerAbi,
      address: NABLA_ROUTER,
      method: 'getAmountOut',
      args: [amountIn, [inputToken.pendulumErc20WrapperAddress, outputToken.erc20WrapperAddress]],
      noWalletAddressRequired: true,
      queryOptions: {
        ...activeOptions['30s'],
        enabled,
      },
      parseSuccessOutput: (data) => {
        if (outputToken === undefined || inputToken === undefined || debouncedAmountBigDecimal === undefined) {
          return undefined;
        }

        const preciseQuotedAmountOut = parseContractBalanceResponse(outputToken.decimals, data[0]);
        const swapFee = parseContractBalanceResponse(outputToken.decimals, data[1]);

        return {
          preciseQuotedAmountOut,
          roundedDownQuotedAmountOut: preciseQuotedAmountOut.preciseBigDecimal.round(2, 0),
          effectiveExchangeRate: stringifyBigWithSignificantDecimals(
            preciseQuotedAmountOut.preciseBigDecimal.div(debouncedAmountBigDecimal),
            4,
          ),
          swapFee,
        };
      },
      parseError: (error) => {
        const insufficientLiquidityMessage = () => {
          trackEvent({
            event: 'form_error',
            error_message: 'insufficient_liquidity',
            input_amount: amountIn ? amountIn : '0',
          });
          return 'Insufficient liquidity for this exchange. Please try a smaller amount or try again later.';
        };

        switch (error.type) {
          case 'error':
            return 'Something went wrong';
          case 'panic':
            return error.errorCode === 0x11 ? insufficientLiquidityMessage() : 'Something went wrong';
          case 'reverted':
            return error.description === 'SwapPool: EXCEEDS_MAX_COVERAGE_RATIO'
              ? insufficientLiquidityMessage()
              : 'Something went wrong';
          default:
            return 'Something went wrong';
        }
      },
    },
  );

  useEffect(() => {
    const pending =
      (isLoading && fetchStatus !== 'idle') || debouncedFromAmountString !== fromAmountString || initializing;
    if (fetchStatus === 'fetching' && initializing) {
      setInitializing(false);
    }
    setPending(pending);

    if (pending) return;
    if (error === null) {
      clearErrors('root');
    } else {
      setError('root', { type: 'custom', message: error });
    }
  }, [error, isLoading, fetchStatus, initializing, debouncedAmountBigDecimal, fromAmountString, clearErrors, setError]);

  const isInputStable = debouncedFromAmountString === fromAmountString;
  const stableAmountInUnits = isInputStable ? debouncedFromAmountString : undefined;

  return { isLoading: pending, enabled, data, error, stableAmountInUnits };
}
