import {
  FiatToken,
  FiatTokenDetails,
  OnChainTokenDetails,
  QuoteEndpoints,
  getAnyFiatTokenDetails,
  getOnChainTokenDetailsOrDefault,
} from '@packages/shared';
import Big from 'big.js';
import { TFunction } from 'i18next';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { RampDirection } from '../../components/RampToggle';
import { config } from '../../config';
import { getTokenDisabledReason, isFiatTokenDisabled } from '../../config/tokenAvailability';
import { TrackableEvent, useEventsContext } from '../../contexts/events';
import { useNetwork } from '../../contexts/network';
import { multiplyByPowerOfTen, stringifyBigWithSignificantDecimals } from '../../helpers/contracts';
import { useQuote, useQuoteError } from '../../stores/ramp/useQuoteStore';
import { useRampFormStore } from '../../stores/ramp/useRampFormStore';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { useOnchainTokenBalance } from '../useOnchainTokenBalance';
import { useVortexAccount } from '../useVortexAccount';

function validateOnramp(
  t: TFunction<'translation', undefined>,
  {
    inputAmount,
    fromToken,
    trackEvent,
  }: {
    inputAmount: Big;
    fromToken: FiatTokenDetails;
    trackEvent: (event: TrackableEvent) => void;
  },
): string | null {
  // Monerium EUR has no minimum

  const maxAmountUnits = multiplyByPowerOfTen(Big(fromToken.maxWithdrawalAmountRaw), -fromToken.decimals);
  const minAmountUnits = multiplyByPowerOfTen(Big(fromToken.minWithdrawalAmountRaw), -fromToken.decimals);

  if (inputAmount && maxAmountUnits.lt(inputAmount)) {
    trackEvent({
      event: 'form_error',
      error_message: 'more_than_maximum_withdrawal',
      input_amount: inputAmount ? inputAmount.toString() : '0',
    });
    return t('pages.swap.error.moreThanMaximumWithdrawal.buy', {
      maxAmountUnits: stringifyBigWithSignificantDecimals(maxAmountUnits, 2),
      assetSymbol: fromToken.fiat.symbol,
    });
  }

  // TODO remove once Token selection is improved.
  if (fromToken.assetSymbol === 'EURC') {
    return null;
  }

  if (inputAmount && !inputAmount.eq(0) && minAmountUnits.gt(inputAmount)) {
    trackEvent({
      event: 'form_error',
      error_message: 'less_than_minimum_withdrawal',
      input_amount: inputAmount ? inputAmount.toString() : '0',
    });
    return t('pages.swap.error.lessThanMinimumWithdrawal.buy', {
      minAmountUnits: stringifyBigWithSignificantDecimals(minAmountUnits, 2),
      assetSymbol: fromToken.fiat.symbol,
    });
  }

  return null;
}

function validateOfframp(
  t: TFunction<'translation', undefined>,
  {
    inputAmount,
    fromToken,
    toToken,
    quote,
    userInputTokenBalance,
    trackEvent,
  }: {
    inputAmount: Big;
    fromToken: OnChainTokenDetails;
    toToken: FiatTokenDetails;
    quote: QuoteEndpoints.QuoteResponse;
    userInputTokenBalance: string | null;
    trackEvent: (event: TrackableEvent) => void;
  },
): string | null {
  if (typeof userInputTokenBalance === 'string') {
    // if (Big(userInputTokenBalance).lt(inputAmount ?? 0)) {
    //   trackEvent({
    //     event: 'form_error',
    //     error_message: 'insufficient_balance',
    //     input_amount: inputAmount ? inputAmount.toString() : '0',
    //   });
    //   return t('pages.swap.error.insufficientFunds', {
    //     userInputTokenBalance,
    //     assetSymbol: fromToken?.assetSymbol,
    //   });
    // }
  }

  const maxAmountUnits = multiplyByPowerOfTen(Big(toToken.maxWithdrawalAmountRaw), -toToken.decimals);
  const minAmountUnits = multiplyByPowerOfTen(Big(toToken.minWithdrawalAmountRaw), -toToken.decimals);
  const exchangeRate = quote ? Number(quote.outputAmount) / Number(quote.inputAmount) : 0;

  if (inputAmount && exchangeRate && maxAmountUnits.lt(inputAmount.mul(exchangeRate))) {
    trackEvent({
      event: 'form_error',
      error_message: 'more_than_maximum_withdrawal',
      input_amount: inputAmount ? inputAmount.toString() : '0',
    });
    return t('pages.swap.error.moreThanMinimumWithdrawal.sell', {
      minAmountUnits: stringifyBigWithSignificantDecimals(minAmountUnits, 2),
      assetSymbol: toToken.fiat.symbol,
    });
  }

  const amountOut = quote ? Big(quote.outputAmount) : Big(0);

  if (!amountOut.eq(0)) {
    if (!config.test.overwriteMinimumTransferAmount && minAmountUnits.gt(amountOut)) {
      trackEvent({
        event: 'form_error',
        error_message: 'less_than_minimum_withdrawal',
        input_amount: inputAmount ? inputAmount.toString() : '0',
      });

      return t('pages.swap.error.lessThanMinimumWithdrawal.sell', {
        minAmountUnits: stringifyBigWithSignificantDecimals(minAmountUnits, 2),
        assetSymbol: toToken.fiat.symbol,
      });
    }
  }

  return null;
}

function validateTokenAvailability(
  t: TFunction<'translation', undefined>,
  fiatToken: FiatToken,
  trackEvent: (event: TrackableEvent) => void,
): string | null {
  if (isFiatTokenDisabled(fiatToken)) {
    const reason = getTokenDisabledReason(fiatToken);
    trackEvent({
      event: 'token_unavailable',
      token: fiatToken,
    });
    return t(reason);
  }
  return null;
}

export const useRampValidation = () => {
  const { t } = useTranslation();

  const { inputAmount: inputAmountString, onChainToken, fiatToken } = useRampFormStore();
  const quote = useQuote();
  const quoteError = useQuoteError();
  const { selectedNetwork } = useNetwork();
  const { trackEvent } = useEventsContext();
  const rampDirection = useRampDirection();
  const isOnramp = rampDirection === RampDirection.ONRAMP;
  const { isDisconnected } = useVortexAccount();

  const inputAmount = useMemo(() => Big(inputAmountString || '0'), [inputAmountString]);

  const fromToken = isOnramp
    ? getAnyFiatTokenDetails(fiatToken)
    : getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken);

  const toToken = isOnramp
    ? getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken)
    : getAnyFiatTokenDetails(fiatToken);

  const userInputTokenBalance = useOnchainTokenBalance({
    token: (isOnramp ? toToken : fromToken) as OnChainTokenDetails,
  });

  const getCurrentErrorMessage = useCallback(() => {
    if (quoteError) return quoteError;

    if (isDisconnected) return;

    // First check if the fiat token is enabled
    const tokenAvailabilityError = validateTokenAvailability(t, fiatToken, trackEvent);
    if (tokenAvailabilityError) return tokenAvailabilityError;

    let validationError = null;

    if (isOnramp) {
      validationError = validateOnramp(t, {
        inputAmount,
        fromToken: fromToken as FiatTokenDetails,
        trackEvent,
      });
    } else {
      validationError = validateOfframp(t, {
        inputAmount,
        fromToken: fromToken as OnChainTokenDetails,
        toToken: toToken as FiatTokenDetails,
        quote: quote as QuoteEndpoints.QuoteResponse,
        userInputTokenBalance: userInputTokenBalance?.balance || '0',
        trackEvent,
      });
    }

    if (validationError) return validationError;

    return null;
  }, [
    quoteError,
    isDisconnected,
    isOnramp,
    t,
    inputAmount,
    fromToken,
    trackEvent,
    toToken,
    quote,
    userInputTokenBalance?.balance,
    fiatToken,
  ]);

  return {
    getCurrentErrorMessage,
    isValid: !getCurrentErrorMessage(),
  };
};
