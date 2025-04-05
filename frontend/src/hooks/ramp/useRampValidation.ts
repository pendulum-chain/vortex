import { useCallback, useState } from 'react';
import Big from 'big.js';
import { getAnyFiatTokenDetails, getOnChainTokenDetailsOrDefault } from 'shared';

import { useVortexAccount } from '../useVortexAccount';
import { useOnchainTokenBalance } from '../useOnchainTokenBalance';
import { useQuoteStore } from '../../stores/ramp/useQuoteStore';
import { useRampFormStore } from '../../stores/ramp/useRampFormStore';
import { useNetwork } from '../../contexts/network';
import { multiplyByPowerOfTen, stringifyBigWithSignificantDecimals } from '../../helpers/contracts';
import { useEventsContext } from '../../contexts/events';
import { config } from '../../config';

/**
 * Hook for handling ramp validation logic
 * Encapsulates validation rules and error messages
 */
export const useRampValidation = () => {
  const { fromAmount, from, to } = useRampFormStore();
  const { quote, loading: quoteLoading } = useQuoteStore();
  const { isDisconnected } = useVortexAccount();
  const { selectedNetwork } = useNetwork();
  const { trackEvent } = useEventsContext();

  // Initialization failure state
  const [initializeFailedMessage, setInitializeFailedMessage] = useState<string | null>(null);

  const fromToken = getOnChainTokenDetailsOrDefault(selectedNetwork, from);
  const toToken = getAnyFiatTokenDetails(to);

  const userInputTokenBalance = useOnchainTokenBalance({ token: fromToken });

  /**
   * Validates the current state and returns an error message if validation fails
   */
  const getCurrentErrorMessage = useCallback(() => {
    if (isDisconnected) return 'Please connect your wallet';

    if (typeof userInputTokenBalance === 'string') {
      if (Big(userInputTokenBalance).lt(fromAmount ?? 0)) {
        trackEvent({
          event: 'form_error',
          error_message: 'insufficient_balance',
          input_amount: fromAmount ? fromAmount.toString() : '0',
        });
        return `Insufficient balance. Your balance is ${userInputTokenBalance} ${fromToken?.assetSymbol}.`;
      }
    }

    const maxAmountUnits = multiplyByPowerOfTen(Big(toToken.maxWithdrawalAmountRaw), -toToken.decimals);
    const minAmountUnits = multiplyByPowerOfTen(Big(toToken.minWithdrawalAmountRaw), -toToken.decimals);

    // Use exchange rate from quote if available
    const exchangeRate = quote ? Number(quote.outputAmount) / Number(quote.inputAmount) : 0;

    if (fromAmount && exchangeRate && maxAmountUnits.lt(fromAmount.mul(exchangeRate))) {
      trackEvent({
        event: 'form_error',
        error_message: 'more_than_maximum_withdrawal',
        input_amount: fromAmount ? fromAmount.toString() : '0',
      });
      return `Maximum withdrawal amount is ${stringifyBigWithSignificantDecimals(maxAmountUnits, 2)} ${
        toToken.fiat.symbol
      }.`;
    }

    // Use amount from quote if available
    const amountOut = quote ? Big(quote.outputAmount) : Big(0);

    if (!amountOut.eq(0)) {
      if (!config.test.overwriteMinimumTransferAmount && minAmountUnits.gt(amountOut)) {
        trackEvent({
          event: 'form_error',
          error_message: 'less_than_minimum_withdrawal',
          input_amount: fromAmount ? fromAmount.toString() : '0',
        });
        return `Minimum withdrawal amount is ${stringifyBigWithSignificantDecimals(minAmountUnits, 2)} ${
          toToken.fiat.symbol
        }.`;
      }
    }

    if (quoteLoading) return 'Calculating quote...';

    return null;
  }, [
    isDisconnected,
    userInputTokenBalance,
    fromAmount,
    toToken,
    quote,
    quoteLoading,
    fromToken,
    trackEvent
  ]);

  /**
   * Sets initialization failed message
   */
  const setInitializeFailed = useCallback((message?: string | null) => {
    setInitializeFailedMessage(
      message ??
        "We're experiencing a digital traffic jam. Please hold tight while we clear the road and get things moving again!",
    );
  }, []);

  return {
    getCurrentErrorMessage,
    initializeFailedMessage,
    setInitializeFailed,
    isValid: !getCurrentErrorMessage(),
  };
};