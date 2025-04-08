import { FC } from 'react';
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

  const from = useOnChainToken();
  const to = useFiatToken();
  const fromAmount = useInputAmount();

  const fromToken = getOnChainTokenDetailsOrDefault(selectedNetwork, from);
  const toToken = getAnyFiatTokenDetails(to);
  const toAmount = useQuoteOutputAmount();
  const exchangeRate = useQuoteExchangeRate();

  const displayToken = rampDirection === RampDirection.ONRAMP ? fromToken : fromToken;

  return (
    <FeeCollapse
      fromAmount={fromAmount?.toString()}
      toAmount={toAmount || Big(0)}
      toToken={displayToken}
      exchangeRate={
        <ExchangeRate exchangeRate={exchangeRate} fromToken={fromToken} toTokenSymbol={toToken.fiat.symbol} />
      }
    />
  );
};
