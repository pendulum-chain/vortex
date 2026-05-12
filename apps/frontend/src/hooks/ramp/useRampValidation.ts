import {
  AmountLimits,
  FiatToken,
  FiatTokenDetails,
  getAnyFiatTokenDetails,
  getOnChainTokenDetailsOrDefault,
  OnChainTokenDetails,
  QuoteError,
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
import { getEvmTokenConfig } from "../../services/tokens";
import { useQuoteFormStore } from "../../stores/quote/useQuoteFormStore";
import { useQuote, useQuoteError, useQuoteLoading } from "../../stores/quote/useQuoteStore";
import { useRampDirection } from "../../stores/rampDirectionStore";
import { useOnchainTokenBalance } from "../useOnchainTokenBalance";
import { useVortexAccount } from "../useVortexAccount";

function validateOnramp(
  t: TFunction<"translation", undefined>,
  {
    inputAmount,
    fromToken,
    limits,
    trackEvent
  }: {
    inputAmount: Big;
    fromToken: FiatTokenDetails;
    limits?: AmountLimits;
    trackEvent: (event: TrackableEvent) => void;
  }
): string | null {
  const maxAmountUnits = limits
    ? new Big(limits.max)
    : multiplyByPowerOfTen(Big(fromToken.maxBuyAmountRaw), -fromToken.decimals);
  const minAmountUnits = limits
    ? new Big(limits.min)
    : multiplyByPowerOfTen(Big(fromToken.minBuyAmountRaw), -fromToken.decimals);

  const isTooHigh = maxAmountUnits.lt(inputAmount);
  const isTooLow = !inputAmount.eq(0) && minAmountUnits.gt(inputAmount);

  if (isTooHigh || isTooLow) {
    trackEvent({
      error_message: isTooHigh ? "more_than_maximum_withdrawal" : "less_than_minimum_withdrawal",
      event: "form_error",
      input_amount: inputAmount.toString()
    });
    const key = isTooHigh ? "pages.swap.error.amountOutOfRange.buyTooHigh" : "pages.swap.error.amountOutOfRange.buyTooLow";
    return t(key, {
      assetSymbol: fromToken.fiat.symbol,
      maxAmountUnits: stringifyBigWithSignificantDecimals(maxAmountUnits, 0),
      minAmountUnits: stringifyBigWithSignificantDecimals(minAmountUnits, 0)
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
    limits,
    userInputTokenBalance,
    isDisconnected,
    trackEvent
  }: {
    inputAmount: Big;
    fromToken: OnChainTokenDetails;
    toToken: FiatTokenDetails;
    quote: QuoteResponse;
    limits?: AmountLimits;
    userInputTokenBalance: string | null;
    isDisconnected: boolean;
    trackEvent: (event: TrackableEvent) => void;
  }
): string | null {
  // AlfredPay path compares the stablecoin-denominated `inputAmount` against the resolved input limits.
  // Legacy path (BRL/EURC) compares the fiat `outputAmount` against the fiat min/max on the destination token.
  const check = limits
    ? {
        amount: inputAmount,
        max: new Big(limits.max),
        min: new Big(limits.min),
        symbol: fromToken.assetSymbol
      }
    : {
        amount: quote ? Big(quote.outputAmount) : Big(0),
        max: multiplyByPowerOfTen(Big(toToken.maxSellAmountRaw), -toToken.decimals),
        min: multiplyByPowerOfTen(Big(toToken.minSellAmountRaw), -toToken.decimals),
        symbol: toToken.fiat.symbol
      };
  const { max: maxAmountUnits, min: minAmountUnits, amount: amountToCheck, symbol: unitSymbol } = check;

  const isTooHigh = !!quote && maxAmountUnits.lt(amountToCheck);
  const isTooLow = !amountToCheck.eq(0) && !config.test.overwriteMinimumTransferAmount && minAmountUnits.gt(amountToCheck);

  if (isTooHigh || isTooLow) {
    trackEvent({
      error_message: isTooHigh ? "more_than_maximum_withdrawal" : "less_than_minimum_withdrawal",
      event: "form_error",
      input_amount: inputAmount.toString()
    });
    const key = isTooHigh ? "pages.swap.error.amountOutOfRange.sellTooHigh" : "pages.swap.error.amountOutOfRange.sellTooLow";
    return t(key, {
      assetSymbol: unitSymbol,
      maxAmountUnits: stringifyBigWithSignificantDecimals(maxAmountUnits, 0),
      minAmountUnits: stringifyBigWithSignificantDecimals(minAmountUnits, 0)
    });
  }

  if (typeof userInputTokenBalance === "string" && !isDisconnected) {
    const isNativeToken = fromToken.isNative;
    if (Big(userInputTokenBalance).lt(inputAmount)) {
      trackEvent({
        error_message: "insufficient_balance",
        event: "form_error",
        input_amount: inputAmount.toString()
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
  const quoteLoading = useQuoteLoading();
  const quoteError = useQuoteError();
  const { selectedNetwork } = useNetwork();
  const { trackEvent } = useEventsContext();
  const rampDirection = useRampDirection();
  const isOnramp = rampDirection === RampDirection.BUY;
  const { isDisconnected } = useVortexAccount();

  const inputAmount = useMemo(() => Big(inputAmountString || "0"), [inputAmountString]);

  const fromToken = isOnramp
    ? getAnyFiatTokenDetails(fiatToken)
    : getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken, getEvmTokenConfig());

  const toToken = isOnramp
    ? getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken, getEvmTokenConfig())
    : getAnyFiatTokenDetails(fiatToken);

  const userInputTokenBalance = useOnchainTokenBalance({
    token: (isOnramp ? toToken : fromToken) as OnChainTokenDetails
  });

  const getCurrentErrorMessage = useCallback(() => {
    if (quoteLoading) return null;

    // First check if the fiat token is enabled
    const tokenAvailabilityError = validateTokenAvailability(t, fiatToken, trackEvent);
    if (tokenAvailabilityError) return tokenAvailabilityError;

    // For offramps, we must also show a valid error message, when backend refuses to calculate a quote
    // due to limits.

    const fiatTokenDetails = getAnyFiatTokenDetails(fiatToken);

    if (quoteError?.includes(QuoteError.BelowLowerLimitSell)) {
      const maxAmountUnits = multiplyByPowerOfTen(Big(fiatTokenDetails.maxSellAmountRaw), -toToken.decimals);
      const minAmountUnits = multiplyByPowerOfTen(Big(fiatTokenDetails.minSellAmountRaw), -toToken.decimals);
      return t("pages.swap.error.amountOutOfRange.sellTooLow", {
        assetSymbol: toToken.assetSymbol,
        maxAmountUnits: stringifyBigWithSignificantDecimals(maxAmountUnits, 0),
        minAmountUnits: stringifyBigWithSignificantDecimals(minAmountUnits, 0)
      });
    } else if (quoteError?.includes(QuoteError.BelowLowerLimitBuy) || quoteError?.includes(QuoteError.InputAmountTooLow)) {
      const maxAmountUnits = multiplyByPowerOfTen(Big(fiatTokenDetails.maxBuyAmountRaw), -fromToken.decimals);
      const minAmountUnits = multiplyByPowerOfTen(Big(fiatTokenDetails.minBuyAmountRaw), -fromToken.decimals);
      return t("pages.swap.error.amountOutOfRange.buyTooLow", {
        assetSymbol: fromToken.assetSymbol,
        maxAmountUnits: stringifyBigWithSignificantDecimals(maxAmountUnits, 0),
        minAmountUnits: stringifyBigWithSignificantDecimals(minAmountUnits, 0)
      });
    } else if (quoteError) return t(quoteError);

    const limits = quote?.alfredpayInputLimits;
    let validationError = null;
    if (isOnramp) {
      validationError = validateOnramp(t, {
        fromToken: fromToken as FiatTokenDetails,
        inputAmount,
        limits,
        trackEvent
      });
    } else {
      validationError = validateOfframp(t, {
        fromToken: fromToken as OnChainTokenDetails,
        inputAmount,
        isDisconnected,
        limits,
        quote: quote as QuoteResponse,
        toToken: toToken as FiatTokenDetails,
        trackEvent,
        userInputTokenBalance: userInputTokenBalance?.balance || "0"
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
    quoteLoading,
    userInputTokenBalance?.balance,
    fiatToken
  ]);

  return {
    getCurrentErrorMessage,
    isValid: !getCurrentErrorMessage()
  };
};
