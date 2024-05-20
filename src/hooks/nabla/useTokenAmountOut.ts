import BigNumber from 'bn.js';
import { activeOptions, cacheKeys } from '../../constants/cache';
import { routerAbi } from '../../contracts/Router'
import { ContractBalance, parseContractBalanceResponse } from '../../helpers/contracts';
import { decimalToCustom, stringDecimalToBN } from '../../helpers/parseNumbers';
import { NABLA_ROUTER } from '../../constants/constants';
import { useContractRead } from './useContractRead';
import { UseQueryResult } from '@tanstack/react-query';
import { subtractBigDecimalPercentage } from '../../helpers/calc';
import { TokenDetails } from '../../constants/tokenConfig';
import { useDebouncedValue } from '../useDebouncedValue';
import { TOKEN_CONFIG } from '../../constants/tokenConfig';
import { WalletAccount } from '@talismn/connect-wallets';
import { ApiPromise } from '../../services/polkadot/polkadotApi';

export type UseTokenOutAmountProps = {
  api: ApiPromise | null;
  walletAccount: WalletAccount | undefined;
  fromAmount: number | null;
  fromToken: string | null;
  toToken: string | null;
  maximumFromAmount: BigNumber | undefined;
  slippage: number;
  setExpectedSwappedAmount: React.StateUpdater<{
    expectedSwap: number;
    fee: number;
}>
  setError: React.StateUpdater<string | null>;
  setPending: React.StateUpdater<boolean>;
};

export interface TokenOutData {
  amountOut: ContractBalance;
  swapFee: ContractBalance;
  effectiveExchangeRate: string;
  minAmountOut: string;
}

export function useTokenOutAmount({
  api,
  walletAccount,
  fromAmount,
  fromToken,
  toToken,
  maximumFromAmount,
  slippage,
  setExpectedSwappedAmount,
  setError,
  setPending
}: UseTokenOutAmountProps) {
  if (fromToken === null || toToken === null || fromAmount === null || !walletAccount || api === null) {
    setPending(false);
    setError('Required parameters are missing');
    return { isLoading: true, enabled: false, data: undefined, error: 'Required parameters are missing', refetch: undefined }
  }

  let fromTokenDetails: TokenDetails = TOKEN_CONFIG[fromToken];
  let toTokenDetails: TokenDetails = TOKEN_CONFIG[toToken];

  const debouncedFromAmount = useDebouncedValue(fromAmount, 800);
  const debouncedAmountBigDecimal = stringDecimalToBN(debouncedFromAmount.toString(), fromTokenDetails.decimals);

  const enabled = fromToken !== undefined &&
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
          setPending(false);
          console.log("lacntg");
          return undefined;
        }
        const amountOut = parseContractBalanceResponse(toTokenDetails.decimals, data[0]);
        const swapFee = parseContractBalanceResponse(toTokenDetails.decimals, data[1]);
        console.log(amountOut);
        const effectiveExchangeRate = amountOut.preciseBigDecimal.div(debouncedAmountBigDecimal).toString();
        const minAmountOut = subtractBigDecimalPercentage(amountOut.preciseBigDecimal, slippage);

        setExpectedSwappedAmount({
          expectedSwap: amountOut.approximateNumber,
          fee: swapFee.approximateNumber
        });
        return {
          amountOut,
          effectiveExchangeRate,
          swapFee,
          minAmountOut: minAmountOut.toString(),
        };
      },
      parseError: (error) => {
        setError('Something went wrong');
        setPending(false);
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

  const pending = isLoading && fetchStatus !== 'idle';
  setPending(pending);
  if (error) {
    setError(error);
  }

  return { isLoading: pending, enabled, data, error, refetch };
}
