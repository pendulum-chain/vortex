import { FiatToken, getAnyFiatTokenDetails } from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../errors/api-error";
import { multiplyByPowerOfTen } from "../../pendulum/helpers";

/**
 * Get token limit units for a given fiat token, limit type, and operation type
 */
export function getTokenLimitUnits(currency: FiatToken, limitType: "min" | "max", operationType: "buy" | "sell"): Big {
  const tokenDetails = getAnyFiatTokenDetails(currency);

  let limitRaw: string;

  if (operationType === "buy") {
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
  operationType: "buy" | "sell"
): void {
  const amountBig = new Big(amount);
  const limitUnits = getTokenLimitUnits(currency, limitType, operationType);
  const tokenDetails = getAnyFiatTokenDetails(currency);

  let shouldThrowError = false;
  let errorMessage = "";

  if (limitType === "max") {
    shouldThrowError = amountBig.gt(limitUnits);
    errorMessage = `${operationType === "buy" ? "Input" : "Output"} amount exceeds maximum ${operationType} limit of ${limitUnits.toFixed(2)} ${tokenDetails.fiat.symbol}`;
  } else {
    shouldThrowError = amountBig.lt(limitUnits);
    errorMessage = `${operationType === "buy" ? "Output" : "Output"} amount below minimum ${operationType} limit of ${limitUnits.toFixed(2)} ${tokenDetails.fiat.symbol}`;
  }

  if (shouldThrowError) {
    throw new APIError({
      message: errorMessage,
      status: httpStatus.BAD_REQUEST
    });
  }
}
