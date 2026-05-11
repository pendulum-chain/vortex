import { FiatToken, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { resolveAlfredpayQuoteLimits } from "../../../alfredpay/alfredpay.helpers";
import { QuoteContext } from "../../core/types";
import { validateAlfredpayLimits, validateAmountLimits } from "../../core/validation-helpers";
import { BaseFinalizeEngine, FinalizeComputation } from ".";

export class OffRampFinalizeEngine extends BaseFinalizeEngine {
  readonly config = {
    direction: RampDirection.SELL,
    missingFeesMessage: "OffRampFinalizeEngine requires computed anchor fees",
    skipNote: "Skipped for on-ramp request"
  } as const;

  protected async computeOutput(ctx: QuoteContext): Promise<FinalizeComputation> {
    const offrampAmount =
      ctx.request.to === "pix"
        ? (ctx.nablaSwapEvm?.outputAmountDecimal ?? ctx.pendulumToMoonbeamXcm?.outputAmountDecimal)
        : ctx.alfredpayOfframp
          ? ctx.alfredpayOfframp.outputAmountDecimal
          : ctx.pendulumToStellar?.outputAmountDecimal;

    if (!offrampAmount) {
      throw new APIError({
        message:
          "OffRampFinalizeEngine requires nablaSwapEvm, pendulumToMoonbeamXcm, alfredpayOfframp or pendulumToStellar output",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    // AlfredPay's toAmount is already net-of-fees, so no fee subtraction needed.
    // For other providers (Stellar, BRLA), the anchor fee must still be subtracted.
    const isAlfredpay = !!ctx.alfredpayOfframp;
    let amount: Big;

    if (isAlfredpay) {
      amount = new Big(offrampAmount);
    } else {
      const anchorFee = ctx.fees?.displayFiat?.anchor;
      if (anchorFee === undefined) {
        throw new APIError({
          message: "OffRampFinalizeEngine requires computed anchor fees",
          status: httpStatus.INTERNAL_SERVER_ERROR
        });
      }
      amount = new Big(offrampAmount).minus(anchorFee);
    }

    return {
      amount,
      decimals: 2
    };
  }

  protected async validate(ctx: QuoteContext, { amount }: FinalizeComputation): Promise<void> {
    const alfredpayLimits = await resolveAlfredpayQuoteLimits({
      inputCurrency: ctx.request.inputCurrency,
      outputCurrency: ctx.request.outputCurrency,
      rampType: ctx.request.rampType,
      userId: ctx.request.userId
    });

    if (alfredpayLimits) {
      ctx.alfredpayInputLimits = alfredpayLimits.inputLimits;
      validateAlfredpayLimits(ctx.request.inputAmount, alfredpayLimits);
      return;
    }
    validateAmountLimits(amount, ctx.request.outputCurrency as FiatToken, "min", ctx.request.rampType);
  }
}
