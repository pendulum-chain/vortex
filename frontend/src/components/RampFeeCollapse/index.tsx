import { FeeCollapse } from '../FeeCollapse';
import { ExchangeRate } from '../ExchangeRate';
import { useFiatToken, useInputAmount, useOnChainToken } from '../../stores/ramp/useRampFormStore';
import { useNetwork } from '../../contexts/network';
import { getAnyFiatTokenDetails, getOnChainTokenDetailsOrDefault } from 'shared';
import { useQuoteStore } from '../../stores/ramp/useQuoteStore';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { RampDirection } from '../RampToggle';
import Big from 'big.js';

export const RampFeeCollapse = () => {
  const { selectedNetwork } = useNetwork();
  const rampDirection = useRampDirection();
  const { quote, outputAmount } = useQuoteStore();

  const onChainToken = useOnChainToken();
  const fiatToken = useFiatToken();
  const inputAmount = useInputAmount();

  const onChainTokenDetails = getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken);
  const fiatTokenDetails = getAnyFiatTokenDetails(fiatToken);

  const exchangeRateInputToken = rampDirection === RampDirection.ONRAMP ? fiatTokenDetails : onChainTokenDetails;
  const exchangeRateOutputToken = rampDirection === RampDirection.ONRAMP ? onChainTokenDetails : fiatTokenDetails;

  // We use a default of 1 to avoid dividing by zero
  const fromAmount = inputAmount ? Big(inputAmount) : Big(1);
  const toAmount = outputAmount ? Big(outputAmount) : Big(1);
  const fee = quote ? Big(quote.fee) : Big(0);

  const exchangeRateBeforeFees = toAmount.plus(fee).div(fromAmount).toNumber();

  return (
    <FeeCollapse
      toAmount={toAmount}
      toToken={exchangeRateOutputToken}
      fee={fee}
      exchangeRateBeforeFees={
        <ExchangeRate
          exchangeRate={exchangeRateBeforeFees}
          inputToken={exchangeRateInputToken}
          outputToken={exchangeRateOutputToken}
        />
      }
    />
  );
};
