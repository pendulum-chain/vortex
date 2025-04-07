import { FC } from 'react';
import Big from 'big.js';

import { FeeCollapse } from '../FeeCollapse';
import { ExchangeRate } from '../ExchangeRate';
import { useOnChainToken, useInputAmount, useFiatToken } from '../../stores/ramp/useRampFormStore';
import { useQuoteService } from '../../hooks/ramp/useQuoteService';
import { useNetwork } from '../../contexts/network';
import { getOnChainTokenDetailsOrDefault, getAnyFiatTokenDetails } from 'shared';

export const RampFeeCollapse: FC = () => {
  const { selectedNetwork } = useNetwork();

  const from = useOnChainToken();
  const to = useFiatToken();
  const fromAmount = useInputAmount();

  const fromToken = getOnChainTokenDetailsOrDefault(selectedNetwork, from);
  const toToken = getAnyFiatTokenDetails(to);

  const { outputAmount: toAmount, exchangeRate } = useQuoteService(fromAmount, from, to);

  return (
    <FeeCollapse
      fromAmount={fromAmount?.toString()}
      toAmount={toAmount || Big(0)}
      toToken={toToken}
      exchangeRate={
        <ExchangeRate exchangeRate={exchangeRate} fromToken={fromToken} toTokenSymbol={toToken.fiat.symbol} />
      }
    />
  );
};
