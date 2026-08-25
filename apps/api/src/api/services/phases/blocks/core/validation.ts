import { FiatToken, getAnyFiatTokenDetails, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import logger from "../../../../../config/logger";
import { APIError } from "../../../../errors/api-error";
import {
  getAlfredpayMonthlyUsageForEnforcement,
  ResolvedAlfredpayLimits,
  resolveAlfredpayQuoteLimits
} from "../../../alfredpay/alfredpay.helpers";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { QuoteContext } from "../../../quote/core/types";
import { requiresEvmPartnerPayout } from "./helpers";

// Both EVM fee tokens (Base USDC, Polygon USDT) carry 6 decimals.
const EVM_FEE_TOKEN_DECIMALS = 6;

/**
 * Rejects a quote whose COMPUTED partner-markup component would be charged on a
 * corridor that collects fees via EVM transfers while the pricing partner has no
 * `payout_address_evm` — a charged markup must never lack a recipient. Uses the same
 * raw rounding as the fee-transfer builder, so a configured markup that rounds to
 * zero raw units requires no address. Runs after simulation, before persistence.
 */
export function assertEvmPartnerPayoutPresent(ctx: QuoteContext): void {
  const partnerMarkupUsd = ctx.fees?.usd?.partnerMarkup ?? "0";
  const markupRaw = multiplyByPowerOfTen(new Big(partnerMarkupUsd), EVM_FEE_TOKEN_DECIMALS).toFixed(0);
  if (new Big(markupRaw).lte(0) || !requiresEvmPartnerPayout(ctx.request) || ctx.partner?.payoutAddressEvm) {
    return;
  }
  logger.error(
    `Quote rejected: partner '${ctx.partner?.name}' (id=${ctx.partner?.id}) has a computed markup of ${partnerMarkupUsd} USD but no payout_address_evm; route ${ctx.request.from} -> ${ctx.request.to} (${ctx.request.outputCurrency}) collects partner fees on an EVM chain.`
  );
  throw new APIError({
    message: "Partner is missing EVM payout address required for this route",
    status: httpStatus.BAD_REQUEST
  });
}

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

  const used = await getAlfredpayMonthlyUsageForEnforcement(
    userId,
    alfredpayLimits.direction,
    alfredpayLimits.fiat,
    alfredpayLimits.stablecoin
  );
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
