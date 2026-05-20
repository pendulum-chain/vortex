import { RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { QuoteContext } from "../../core/types";
import { BaseDiscountEngine, DiscountComputation } from ".";
import { calculateExpectedOutput, calculateSubsidyAmount, resolveDiscountPartner } from "./helpers";

export class OffRampAlfredpayDiscountEngine extends BaseDiscountEngine {
  readonly config = {
    direction: RampDirection.SELL,
    isOfframp: true,
    skipNote: "Skipped for on-ramp request"
  } as const;

  protected validate(ctx: QuoteContext): void {
    if (!ctx.alfredpayOfframp) {
      throw new Error("OffRampAlfredpayDiscountEngine requires alfredpayOfframp to be defined");
    }

    if (!ctx.request.inputAmount) {
      throw new Error("OffRampAlfredpayDiscountEngine requires request.inputAmount to be defined");
    }
  }

  protected async compute(ctx: QuoteContext): Promise<DiscountComputation> {
    const { inputAmount, rampType } = ctx.request;

    const partner = await resolveDiscountPartner(ctx, rampType);
    const targetDiscount = partner?.targetDiscount ?? 0;
    const maxSubsidy = partner?.maxSubsidy ?? 0;

    const alfredpayOfframp = ctx.alfredpayOfframp!;

    const effectiveRate = alfredpayOfframp.outputAmountDecimal.div(alfredpayOfframp.inputAmountDecimal);

    const finalOutput = alfredpayOfframp.outputAmountDecimal;

    const {
      expectedOutput: expectedOutputDecimal,
      adjustedDifference,
      adjustedTargetDiscount
    } = calculateExpectedOutput(inputAmount, effectiveRate, targetDiscount, this.config.isOfframp, partner);

    const idealSubsidyDecimal = expectedOutputDecimal.gt(finalOutput) ? expectedOutputDecimal.minus(finalOutput) : new Big(0);

    const actualSubsidyDecimal =
      targetDiscount > 0 ? calculateSubsidyAmount(expectedOutputDecimal, finalOutput, maxSubsidy) : new Big(0);

    const targetOutputDecimal = finalOutput.plus(actualSubsidyDecimal);

    const subsidyRate = expectedOutputDecimal.gt(0) ? actualSubsidyDecimal.div(expectedOutputDecimal) : new Big(0);

    return {
      actualOutputAmountDecimal: finalOutput,
      actualOutputAmountRaw: finalOutput.toFixed(6, 0),
      adjustedDifference,
      adjustedTargetDiscount,
      expectedOutputAmountDecimal: expectedOutputDecimal,
      expectedOutputAmountRaw: expectedOutputDecimal.toFixed(6, 0),
      idealSubsidyAmountInOutputTokenDecimal: idealSubsidyDecimal,
      idealSubsidyAmountInOutputTokenRaw: idealSubsidyDecimal.toFixed(6, 0),
      partnerId: partner ? partner.id : null,
      subsidyAmountInOutputTokenDecimal: actualSubsidyDecimal,
      subsidyAmountInOutputTokenRaw: actualSubsidyDecimal.toFixed(6, 0),
      subsidyRate,
      targetOutputAmountDecimal: targetOutputDecimal,
      targetOutputAmountRaw: targetOutputDecimal.toFixed(6, 0)
    };
  }
}
