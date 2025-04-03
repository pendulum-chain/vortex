import {
  useSwapFromAmount,
  useSwapFromTokenDetails,
  useSwapTokenOutAmount,
  useSwapToTokenDetails,
} from '../../../stores/offrampStoreSecond';
import { ExchangeRate } from '../../ExchangeRate';
import { FeeCollapse } from '../../FeeCollapse';

export const SwapFeeCollapse = () => {
  const fromAmount = useSwapFromAmount();
  const fromToken = useSwapFromTokenDetails();
  const toToken = useSwapToTokenDetails();
  const tokenOutAmount = useSwapTokenOutAmount();

  if (!fromToken || !toToken || !tokenOutAmount) {
    return null;
  }

  return (
    <FeeCollapse
      fromAmount={fromAmount?.toString()}
      toAmount={tokenOutAmount?.data?.roundedDownQuotedAmountOut}
      toToken={toToken}
      exchangeRate={
        <ExchangeRate
          exchangeRate={tokenOutAmount?.data?.effectiveExchangeRate}
          fromToken={fromToken}
          toTokenSymbol={toToken.fiat.symbol}
        />
      }
    />
  );
};
