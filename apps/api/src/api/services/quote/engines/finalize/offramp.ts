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
    const anchorFee = ctx.fees?.displayFiat?.anchor;
    if (anchorFee === undefined) {
      throw new APIError({
        message: "OffRampFinalizeEngine requires computed anchor fees",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    const offrampAmountBeforeAnchorFees =
      ctx.request.to === "pix" ? ctx.pendulumToMoonbeamXcm?.outputAmountDecimal : ctx.pendulumToStellar?.outputAmountDecimal;

    if (!offrampAmountBeforeAnchorFees) {
      throw new APIError({
        message: "OffRampFinalizeEngine requires pendulumToMoonbeamXcm or pendulumToStellar output",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    const amount = new Big(offrampAmountBeforeAnchorFees).minus(anchorFee);

    return {
      amount,
      decimals: 2
    };
  }

  protected validate(ctx: QuoteContext, { amount }: FinalizeComputation): void {
    validateAmountLimits(amount, ctx.request.outputCurrency as FiatToken, "min", ctx.request.rampType);
  }
}
