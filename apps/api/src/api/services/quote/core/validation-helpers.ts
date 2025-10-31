import { FiatToken, getAnyFiatTokenDetails, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../errors/api-error";
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
