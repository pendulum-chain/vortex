import { FiatToken, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { QuoteContext } from "../../core/types";
import { validateAmountLimits } from "../../core/validation-helpers";
import { BaseFinalizeEngine, FinalizeComputation } from ".";

export class OffRampFinalizeEngine extends BaseFinalizeEngine {
  readonly config = {
    direction: RampDirection.SELL,
    missingFeesMessage: "OffRampFinalizeEngine requires computed anchor fees",
    skipNote: "Skipped for on-ramp request"
  } as const;

  protected async computeOutput(ctx: QuoteContext): Promise<FinalizeComputation> {
    const offrampAmount = this.resolveOfframpAmount(ctx);

    if (!offrampAmount) {
      throw new APIError({
        message:
          "OffRampFinalizeEngine requires nablaSwapEvm, pendulumToMoonbeamXcm, alfredpayOfframp, pendulumToStellar or mykoboOffRamp output",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    // AlfredPay's toAmount and Mykobo's toAmount are already net-of-fees, so no fee subtraction needed.
    // For other providers (Stellar, BRLA), the anchor fee must still be subtracted.
    const isFeeAlreadyApplied = !!ctx.alfredpayOfframp || !!ctx.mykoboOffRamp;
    let amount: Big;

    if (isFeeAlreadyApplied) {
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

  protected validate(ctx: QuoteContext, { amount }: FinalizeComputation): void {
    validateAmountLimits(amount, ctx.request.outputCurrency as FiatToken, "min", ctx.request.rampType);
  }

  private resolveOfframpAmount(ctx: QuoteContext): Big | undefined {
    if (ctx.mykoboOffRamp) {
      return ctx.mykoboOffRamp.outputAmountDecimal;
    }
    if (ctx.request.to === "pix") {
      return ctx.nablaSwapEvm?.outputAmountDecimal ?? ctx.pendulumToMoonbeamXcm?.outputAmountDecimal;
    }
    if (ctx.alfredpayOfframp) {
      return ctx.alfredpayOfframp.outputAmountDecimal;
    }
    return ctx.pendulumToStellar?.outputAmountDecimal;
  }
}
