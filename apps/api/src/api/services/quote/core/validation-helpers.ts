import { FiatToken, getAnyFiatTokenDetails, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../errors/api-error";
import { AlfredpayQuoteLimitsContext } from "../../alfredpay/alfredpay.helpers";
import { multiplyByPowerOfTen } from "../../pendulum/helpers";

/**
 * Get token limit units for a given fiat token, limit type, and operation type
 */
export function getTokenLimitUnits(currency: FiatToken, limitType: "min" | "max", operationType: RampDirection): Big {
  const tokenDetails = getAnyFiatTokenDetails(currency);

  let limitRaw: string;

  if (operationType === RampDirection.BUY) {
    limitRaw = limitType === "min" ? tokenDetails.minBuyAmountRaw : tokenDetails.maxBuyAmountRaw;
  } else {
    limitRaw = limitType === "min" ? tokenDetails.minSellAmountRaw : tokenDetails.maxSellAmountRaw;
  }

  return multiplyByPowerOfTen(Big(limitRaw), -tokenDetails.decimals);
}

/**
 * Validate amount against token limits and throw appropriate error if validation fails
 */
export function validateAmountLimits(
  amount: Big.BigSource,
  currency: FiatToken,
  limitType: "min" | "max",
  operationType: RampDirection
): void {
  const amountBig = new Big(amount);
  const limitUnits = getTokenLimitUnits(currency, limitType, operationType);
  const tokenDetails = getAnyFiatTokenDetails(currency);

  const shouldThrowError = limitType === "max" ? amountBig.gt(limitUnits) : amountBig.lt(limitUnits);
  const errorMessage =
    limitType === "max"
      ? `${operationType === RampDirection.BUY ? "Input" : "Output"} amount exceeds maximum ${operationType} limit of ${limitUnits.toFixed(2)} ${tokenDetails.fiat.symbol}`
      : `${operationType === RampDirection.BUY ? "Input" : "Output"} amount below minimum ${operationType} limit of ${limitUnits.toFixed(2)} ${tokenDetails.fiat.symbol}`;

  if (shouldThrowError) {
    throw new APIError({
      message: errorMessage,
      status: httpStatus.BAD_REQUEST
    });
  }
}

/**
 * Validate an amount against precomputed AlfredPay limits. The amount is in the same units as the limits:
 * onramp → fiat units; offramp → stablecoin units.
 */
export function validateAlfredpayLimits(amount: Big.BigSource, limits: AlfredpayQuoteLimitsContext): void {
  const amountBig = new Big(amount);
  const min = new Big(limits.inputLimits.min);
  const max = new Big(limits.inputLimits.max);
  const unitSymbol = limits.direction === "onramp" ? getAnyFiatTokenDetails(limits.fiat).fiat.symbol : limits.stablecoin;

  if (amountBig.lt(min)) {
    throw new APIError({
      message: `Input amount below minimum ${limits.direction} limit of ${min.toFixed(2)} ${unitSymbol}`,
      status: httpStatus.BAD_REQUEST
    });
  }
  if (amountBig.gt(max)) {
    throw new APIError({
      message: `Input amount exceeds maximum ${limits.direction} limit of ${max.toFixed(2)} ${unitSymbol}`,
      status: httpStatus.BAD_REQUEST
    });
  }
}
