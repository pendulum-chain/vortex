import { ALFREDPAY_ERC20_TOKEN } from "@packages/shared";
import { ALFREDPAY_ERC20_DECIMALS, multiplyByPowerOfTen, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { QuoteContext } from "../../core/types";
import { BaseDiscountEngine, DiscountComputation } from ".";
import { calculateExpectedOutput, calculateSubsidyAmount, resolveDiscountPartner } from "./helpers";

export class OnRampAlfredpayDiscountEngine extends BaseDiscountEngine {
  readonly config = {
    direction: RampDirection.BUY,
    isOfframp: false,
    skipNote: "Skipped for off-ramp request"
  } as const;

  protected validate(ctx: QuoteContext): void {
    if (!ctx.alfredpayMint) {
      throw new Error("OnRampAlfredpayDiscountEngine requires alfredpayMint to be defined");
    }

    if (!ctx.request.inputAmount) {
      throw new Error("OnRampAlfredpayDiscountEngine requires request.inputAmount to be defined");
    }
  }

  protected async compute(ctx: QuoteContext): Promise<DiscountComputation> {
    const { inputAmount, rampType } = ctx.request;

    const partner = await resolveDiscountPartner(ctx, rampType);
    const targetDiscount = partner?.targetDiscount ?? 0;
    const maxSubsidy = partner?.maxSubsidy ?? 0;

    const alfredpayMint = ctx.alfredpayMint!;

    const effectiveRate = alfredpayMint.outputAmountDecimal.div(alfredpayMint.inputAmountDecimal);

    const finalOutput = ctx.evmToEvm?.outputAmountDecimal ?? alfredpayMint.outputAmountDecimal;

    console.log(
      `[OnRampAlfredpayDiscountEngine] input=${inputAmount} ${ctx.request.outputCurrency}, alfredpayMintIn=${alfredpayMint.inputAmountDecimal.toString()} ${alfredpayMint.currency}, alfredpayMintOut=${alfredpayMint.outputAmountDecimal.toString()} ${ctx.request.outputCurrency}, effectiveRate=${effectiveRate.toString()}, finalOutput=${finalOutput.toString()}`
    );

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
      actualOutputAmountRaw: multiplyByPowerOfTen(finalOutput, ALFREDPAY_ERC20_DECIMALS).toFixed(0, 0),
      adjustedDifference,
      adjustedTargetDiscount,
      expectedOutputAmountDecimal: expectedOutputDecimal,
      expectedOutputAmountRaw: multiplyByPowerOfTen(expectedOutputDecimal, ALFREDPAY_ERC20_DECIMALS).toFixed(0, 0),
      idealSubsidyAmountInOutputTokenDecimal: idealSubsidyDecimal,
      idealSubsidyAmountInOutputTokenRaw: multiplyByPowerOfTen(idealSubsidyDecimal, ALFREDPAY_ERC20_DECIMALS).toFixed(0, 0),
      partnerId: partner ? partner.id : null,
      subsidyAmountInOutputTokenDecimal: actualSubsidyDecimal,
      subsidyAmountInOutputTokenRaw: multiplyByPowerOfTen(actualSubsidyDecimal, ALFREDPAY_ERC20_DECIMALS).toFixed(0, 0),
      subsidyRate,
      targetOutputAmountDecimal: targetOutputDecimal,
      targetOutputAmountRaw: multiplyByPowerOfTen(targetOutputDecimal, ALFREDPAY_ERC20_DECIMALS).toFixed(0, 0)
    };
  }
}
