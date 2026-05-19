import { FiatToken, getAnyFiatTokenDetails, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../errors/api-error";
import {
  getAlfredpayMonthlyUsage,
  ResolvedAlfredpayLimits,
  resolveAlfredpayQuoteLimits
} from "../../alfredpay/alfredpay.helpers";
import { multiplyByPowerOfTen } from "../../pendulum/helpers";
import { QuoteContext } from "./types";

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
export function validateAlfredpayLimits(amount: Big.BigSource, limits: ResolvedAlfredpayLimits): void {
  const amountBig = new Big(amount);
  const min = new Big(limits.min);
  const max = new Big(limits.max);
  const isOnramp = limits.direction === RampDirection.BUY;
  const verb = isOnramp ? "onramp" : "offramp";
  const unitSymbol = isOnramp ? getAnyFiatTokenDetails(limits.fiat).fiat.symbol : limits.stablecoin;

  if (amountBig.lt(min)) {
    throw new APIError({
      message: `Input amount below minimum ${verb} limit of ${min.toFixed(2)} ${unitSymbol}`,
      status: httpStatus.BAD_REQUEST
    });
  }
  if (amountBig.gt(max)) {
    throw new APIError({
      message: `Input amount exceeds monthly ${verb} limit of ${max.toFixed(2)} ${unitSymbol}`,
      status: httpStatus.BAD_REQUEST
    });
  }
}

/**
 * Returns true when the quote routes through AlfredPay (caller should skip generic validation).
 * The max is a monthly cap; unauthenticated quotes only get per-tx checks.
 */
export async function applyAlfredpayLimits(ctx: QuoteContext, amount: Big.BigSource): Promise<boolean> {
  const alfredpayLimits = await resolveAlfredpayQuoteLimits({
    inputCurrency: ctx.request.inputCurrency,
    outputCurrency: ctx.request.outputCurrency,
    rampType: ctx.request.rampType,
    userId: ctx.request.userId
  });
  if (!alfredpayLimits) return false;
  ctx.alfredpayInputLimits = { max: alfredpayLimits.max, min: alfredpayLimits.min };
  validateAlfredpayLimits(amount, alfredpayLimits);

  const { userId } = ctx.request;
  if (!userId) return true;

  const used = await getAlfredpayMonthlyUsage(userId, alfredpayLimits.direction, alfredpayLimits.fiat);
  const max = new Big(alfredpayLimits.max);
  if (used.plus(new Big(amount)).lte(max)) return true;

  const isOnramp = alfredpayLimits.direction === RampDirection.BUY;
  const verb = isOnramp ? "onramp" : "offramp";
  const unitSymbol = isOnramp ? getAnyFiatTokenDetails(alfredpayLimits.fiat).fiat.symbol : alfredpayLimits.stablecoin;
  throw new APIError({
    message: `Monthly ${verb} limit of ${max.toFixed(2)} ${unitSymbol} would be exceeded (already used ${used.toFixed(2)} ${unitSymbol} this month).`,
    status: httpStatus.BAD_REQUEST
  });
}
