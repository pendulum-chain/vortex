import Big from 'big.js';

import { FeeCollapse } from '../FeeCollapse';
import { ExchangeRate } from '../ExchangeRate';
import { useOnChainToken, useInputAmount, useFiatToken } from '../../stores/ramp/useRampFormStore';
import { useNetwork } from '../../contexts/network';
import { getOnChainTokenDetailsOrDefault, getAnyFiatTokenDetails } from 'shared';
import { useQuoteOutputAmount, useQuoteExchangeRate } from '../../stores/ramp/useQuoteStore';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { RampDirection } from '../RampToggle';

export const RampFeeCollapse = () => {
  const { selectedNetwork } = useNetwork();
  const rampDirection = useRampDirection();

  const onChainToken = useOnChainToken();
  const fiatToken = useFiatToken();
  const fromAmount = useInputAmount();

  const onChainTokenDetails = getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken);
  const fiatTokenDetails = getAnyFiatTokenDetails(fiatToken);
  const toAmount = useQuoteOutputAmount();
  const exchangeRate = useQuoteExchangeRate();

  const exchangeRateInputToken = rampDirection === RampDirection.ONRAMP ? fiatTokenDetails : onChainTokenDetails;
  const exchangeRateOutputToken = rampDirection === RampDirection.ONRAMP ? onChainTokenDetails : fiatTokenDetails;

  return (
    <FeeCollapse
      fromAmount={fromAmount?.toString()}
      toAmount={toAmount}
      toToken={exchangeRateOutputToken}
      exchangeRate={
        <ExchangeRate
          exchangeRate={exchangeRate}
          inputToken={exchangeRateInputToken}
          outputToken={exchangeRateOutputToken}
        />
      }
    />
  );
};
