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
import { multiplyByPowerOfTen } from "../../helpers/contracts";
import { getEvmTokenConfig } from "../../services/tokens";
import { useQuoteFormStore } from "../../stores/quote/useQuoteFormStore";
import { useQuote, useQuoteError, useQuoteLoading } from "../../stores/quote/useQuoteStore";
import { useRampDirection } from "../../stores/rampDirectionStore";
import { useOnchainTokenBalance } from "../useOnchainTokenBalance";
import { useVortexAccount } from "../useVortexAccount";

function formatLimitAmount(amount: Big, locale: string): string {
  return amount.toNumber().toLocaleString(locale, { maximumFractionDigits: 2 });
}

// Backend limit errors carry the value in the suffix, e.g. "...limit of 10000.00 EUR".
const BACKEND_LIMIT_VALUE_REGEX = /of\s+(\d+(?:\.\d+)?)\s+([A-Z]{3})/;

function extractBackendLimit(error: string, locale: string): { amount: string; symbol: string } | null {
  const match = error.match(BACKEND_LIMIT_VALUE_REGEX);
  if (!match) return null;
  return { amount: formatLimitAmount(new Big(match[1]), locale), symbol: match[2] };
}

type LimitKind = "min" | "max";
type LimitDirection = "buy" | "sell";

function buildLimitMessage(
  t: TFunction<"translation", undefined>,
  args: {
    kind: LimitKind;
    direction: LimitDirection;
    fallbackRawAmount: string;
    fallbackDecimals: number;
    fallbackSymbol: string;
    locale: string;
    quoteError?: string | null;
  }
): string {
  const { kind, direction, fallbackRawAmount, fallbackDecimals, fallbackSymbol, locale, quoteError } = args;
  const parsed = quoteError ? extractBackendLimit(quoteError, locale) : null;
  const key =
    kind === "min"
      ? `pages.swap.error.lessThanMinimumWithdrawal.${direction}`
      : `pages.swap.error.moreThanMaximumWithdrawal.${direction}`;
  const valueField = kind === "min" ? "minAmountUnits" : "maxAmountUnits";
  return t(key, {
    assetSymbol: parsed?.symbol ?? fallbackSymbol,
    [valueField]: parsed?.amount ?? formatLimitAmount(multiplyByPowerOfTen(Big(fallbackRawAmount), -fallbackDecimals), locale)
  });
}

function validateOnramp(
  t: TFunction<"translation", undefined>,
  {
    inputAmount,
    fromToken,
    limits,
    locale,
    trackEvent
  }: {
    inputAmount: Big;
    fromToken: FiatTokenDetails;
    limits?: AmountLimits;
    locale: string;
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
    const key = isTooHigh ? "pages.swap.error.moreThanMaximumWithdrawal.buy" : "pages.swap.error.lessThanMinimumWithdrawal.buy";
    return t(key, {
      assetSymbol: fromToken.fiat.symbol,
      maxAmountUnits: formatLimitAmount(maxAmountUnits, locale),
      minAmountUnits: formatLimitAmount(minAmountUnits, locale)
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
    locale,
    userInputTokenBalance,
    isDisconnected,
    trackEvent
  }: {
    inputAmount: Big;
    fromToken: OnChainTokenDetails;
    toToken: FiatTokenDetails;
    quote: QuoteResponse;
    limits?: AmountLimits;
    locale: string;
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
    const key = isTooHigh
      ? "pages.swap.error.moreThanMaximumWithdrawal.sell"
      : "pages.swap.error.lessThanMinimumWithdrawal.sell";
    return t(key, {
      assetSymbol: unitSymbol,
      maxAmountUnits: formatLimitAmount(maxAmountUnits, locale),
      minAmountUnits: formatLimitAmount(minAmountUnits, locale)
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
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

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

    const isBelowSellLimit = quoteError?.includes(QuoteError.BelowLowerLimitSell);
    const isBelowBuyLimit =
      quoteError?.includes(QuoteError.BelowLowerLimitBuy) || quoteError?.includes(QuoteError.InputAmountTooLow);
    const isAboveSellLimit = quoteError?.includes(QuoteError.AboveUpperLimitSell);
    const isAboveBuyLimit = quoteError?.includes(QuoteError.AboveUpperLimitBuy);

    if (isBelowSellLimit) {
      return buildLimitMessage(t, {
        direction: "sell",
        fallbackDecimals: toToken.decimals,
        fallbackRawAmount: fiatTokenDetails.minSellAmountRaw,
        fallbackSymbol: toToken.assetSymbol,
        kind: "min",
        locale,
        quoteError
      });
    } else if (isBelowBuyLimit) {
      return buildLimitMessage(t, {
        direction: "buy",
        fallbackDecimals: fromToken.decimals,
        fallbackRawAmount: fiatTokenDetails.minBuyAmountRaw,
        fallbackSymbol: fromToken.assetSymbol,
        kind: "min",
        locale,
        quoteError
      });
    } else if (isAboveSellLimit) {
      return buildLimitMessage(t, {
        direction: "sell",
        fallbackDecimals: toToken.decimals,
        fallbackRawAmount: fiatTokenDetails.maxSellAmountRaw,
        fallbackSymbol: toToken.assetSymbol,
        kind: "max",
        locale,
        quoteError
      });
    } else if (isAboveBuyLimit) {
      return buildLimitMessage(t, {
        direction: "buy",
        fallbackDecimals: fromToken.decimals,
        fallbackRawAmount: fiatTokenDetails.maxBuyAmountRaw,
        fallbackSymbol: fromToken.assetSymbol,
        kind: "max",
        locale,
        quoteError
      });
    } else if (quoteError) return t(quoteError);

    const limits = quote?.alfredpayInputLimits;
    let validationError = null;
    if (isOnramp) {
      validationError = validateOnramp(t, {
        fromToken: fromToken as FiatTokenDetails,
        inputAmount,
        limits,
        locale,
        trackEvent
      });
    } else {
      validationError = validateOfframp(t, {
        fromToken: fromToken as OnChainTokenDetails,
        inputAmount,
        isDisconnected,
        limits,
        locale,
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
    locale,
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
