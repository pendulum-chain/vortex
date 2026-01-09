import {
  FiatToken,
  FiatTokenDetails,
  getAnyFiatTokenDetails,
  getOnChainTokenDetailsOrDefault,
  OnChainTokenDetails,
  QuoteResponse,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import { TFunction } from "i18next";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { config } from "../../config";
import { getTokenDisabledReason, isFiatTokenDisabled } from "../../config/tokenAvailability";
import { TrackableEvent, useEventsContext } from "../../contexts/events";
import { useNetwork } from "../../contexts/network";
import { multiplyByPowerOfTen, stringifyBigWithSignificantDecimals } from "../../helpers/contracts";
import { useQuoteFormStore } from "../../stores/quote/useQuoteFormStore";
import { useQuote, useQuoteError } from "../../stores/quote/useQuoteStore";
import { useRampDirection } from "../../stores/rampDirectionStore";
import { useOnchainTokenBalance } from "../useOnchainTokenBalance";
import { useVortexAccount } from "../useVortexAccount";

function validateOnramp(
  t: TFunction<"translation", undefined>,
  {
    inputAmount,
    fromToken,
    trackEvent
  }: {
    inputAmount: Big;
    fromToken: FiatTokenDetails;
    trackEvent: (event: TrackableEvent) => void;
  }
): string | null {
  const maxAmountUnits = multiplyByPowerOfTen(Big(fromToken.maxBuyAmountRaw), -fromToken.decimals);
  const minAmountUnits = multiplyByPowerOfTen(Big(fromToken.minBuyAmountRaw), -fromToken.decimals);

  const isTooHigh = inputAmount && maxAmountUnits.lt(inputAmount);
  const isTooLow = inputAmount && !inputAmount.eq(0) && minAmountUnits.gt(inputAmount);

  if (isTooHigh || isTooLow) {
    trackEvent({
      error_message: isTooHigh ? "more_than_maximum_withdrawal" : "less_than_minimum_withdrawal",
      event: "form_error",
      input_amount: inputAmount ? inputAmount.toString() : "0"
    });
    return t("pages.swap.error.amountOutOfRange.buy", {
      assetSymbol: fromToken.fiat.symbol,
      maxAmountUnits: stringifyBigWithSignificantDecimals(maxAmountUnits, 2),
      minAmountUnits: stringifyBigWithSignificantDecimals(minAmountUnits, 2)
    });
  }

  return null;
}

function validateOfframp(
  t: TFunction<"translation", undefined>,
  {
    inputAmount,
    fromToken,
    toToken,
    quote,
    userInputTokenBalance,
    trackEvent
  }: {
    inputAmount: Big;
    fromToken: OnChainTokenDetails;
    toToken: FiatTokenDetails;
    quote: QuoteResponse;
    userInputTokenBalance: string | null;
    trackEvent: (event: TrackableEvent) => void;
  }
): string | null {
  const maxAmountUnits = multiplyByPowerOfTen(Big(toToken.maxSellAmountRaw), -toToken.decimals);
  const minAmountUnits = multiplyByPowerOfTen(Big(toToken.minSellAmountRaw), -toToken.decimals);
  const amountOut = quote ? Big(quote.outputAmount) : Big(0);

  const isTooHigh = inputAmount && quote && maxAmountUnits.lt(amountOut);
  const isTooLow = !amountOut.eq(0) && !config.test.overwriteMinimumTransferAmount && minAmountUnits.gt(amountOut);

  if (isTooHigh || isTooLow) {
    trackEvent({
      error_message: isTooHigh ? "more_than_maximum_withdrawal" : "less_than_minimum_withdrawal",
      event: "form_error",
      input_amount: inputAmount ? inputAmount.toString() : "0"
    });
    return t("pages.swap.error.amountOutOfRange.sell", {
      assetSymbol: toToken.fiat.symbol,
      maxAmountUnits: stringifyBigWithSignificantDecimals(maxAmountUnits, 2),
      minAmountUnits: stringifyBigWithSignificantDecimals(minAmountUnits, 2)
    });
  }

  if (typeof userInputTokenBalance === "string") {
    const isNativeToken = fromToken.isNative;
    if (Big(userInputTokenBalance).lt(inputAmount ?? 0)) {
      trackEvent({
        error_message: "insufficient_balance",
        event: "form_error",
        input_amount: inputAmount ? inputAmount.toString() : "0"
      });
      return t("pages.swap.error.insufficientFunds", {
        assetSymbol: fromToken?.assetSymbol,
        userInputTokenBalance
      });
      // If the user chose the max amount, show a warning for native tokens due to gas fees
    } else if (isNativeToken && Big(userInputTokenBalance).eq(inputAmount)) {
      return t("pages.swap.error.gasWarning");
    }
  }

  return null;
}

function validateTokenAvailability(
  t: TFunction<"translation", undefined>,
  fiatToken: FiatToken,
  trackEvent: (event: TrackableEvent) => void
): string | null {
  if (isFiatTokenDisabled(fiatToken)) {
    const reason = getTokenDisabledReason(fiatToken);
    trackEvent({
      event: "token_unavailable",
      token: fiatToken
    });
    return t(reason);
  }
  return null;
}

export const useRampValidation = () => {
  const { t } = useTranslation();

  const { inputAmount: inputAmountString, onChainToken, fiatToken } = useQuoteFormStore();
  const quote = useQuote();
  const quoteError = useQuoteError();
  const { selectedNetwork } = useNetwork();
  const { trackEvent } = useEventsContext();
  const rampDirection = useRampDirection();
  const isOnramp = rampDirection === RampDirection.BUY;
  const { isDisconnected } = useVortexAccount();

  const inputAmount = useMemo(() => Big(inputAmountString || "0"), [inputAmountString]);

  const fromToken = isOnramp
    ? getAnyFiatTokenDetails(fiatToken)
    : getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken);

  const toToken = isOnramp ? getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken) : getAnyFiatTokenDetails(fiatToken);

  const userInputTokenBalance = useOnchainTokenBalance({
    token: (isOnramp ? toToken : fromToken) as OnChainTokenDetails
  });

  const getCurrentErrorMessage = useCallback(() => {
    if (isDisconnected) return;

    // First check if the fiat token is enabled
    const tokenAvailabilityError = validateTokenAvailability(t, fiatToken, trackEvent);
    if (tokenAvailabilityError) return tokenAvailabilityError;

    let validationError = null;

    if (isOnramp) {
      validationError = validateOnramp(t, {
        fromToken: fromToken as FiatTokenDetails,
        inputAmount,
        trackEvent
      });
    } else {
      validationError = validateOfframp(t, {
        fromToken: fromToken as OnChainTokenDetails,
        inputAmount,
        quote: quote as QuoteResponse,
        toToken: toToken as FiatTokenDetails,
        trackEvent,
        userInputTokenBalance: userInputTokenBalance?.balance || "0"
      });
    }

    if (validationError) return validationError;

    if (quoteError) return t(quoteError);

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
    fiatToken
  ]);

  return {
    getCurrentErrorMessage,
    isValid: !getCurrentErrorMessage()
  };
};
