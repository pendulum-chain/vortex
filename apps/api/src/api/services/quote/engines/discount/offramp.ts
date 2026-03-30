import { multiplyByPowerOfTen, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../../config/logger";
import { QuoteContext } from "../../core/types";
import { BaseDiscountEngine, DiscountComputation } from ".";
import { calculateExpectedOutput, calculateSubsidyAmount, resolveDiscountPartner } from "./helpers";

export class OffRampDiscountEngine extends BaseDiscountEngine {
  readonly config = {
    direction: RampDirection.SELL,
    isOfframp: true,
    skipNote: "Skipped for on-ramp request"
  } as const;

  protected validate(ctx: QuoteContext): void {
    if (!ctx.nablaSwap) {
      throw new Error("OffRampDiscountEngine requires nablaSwap to be defined");
    }

    if (!ctx.nablaSwap.oraclePrice) {
      throw new Error("OffRampDiscountEngine requires nablaSwap.oraclePrice to be defined");
    }

    if (!ctx.request.inputAmount) {
      throw new Error("OffRampDiscountEngine requires request.inputAmount to be defined");
    }
  }

  protected async compute(ctx: QuoteContext): Promise<DiscountComputation> {
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const nablaSwap = ctx.nablaSwap!;
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const oraclePrice = nablaSwap.oraclePrice!;

    const { inputAmount, rampType } = ctx.request;

    const partner = await resolveDiscountPartner(ctx, rampType);
    const targetDiscount = partner?.targetDiscount ?? 0;
    const maxSubsidy = partner?.maxSubsidy ?? 0;

    // Calculate the oracle-based expected output in BRL.
    const {
      expectedOutput: oracleExpectedOutputDecimal,
      adjustedDifference,
      adjustedTargetDiscount
    } = calculateExpectedOutput(inputAmount, oraclePrice, targetDiscount, this.config.isOfframp, partner);

    // Account for the anchor fee deducted in the Finalize stage, which reduces the user's received amount.
    // We need to add it back to the expected output to calculate the subsidy correctly.
    const anchorFeeInBrl = ctx.fees?.displayFiat?.anchor ? new Big(ctx.fees.displayFiat.anchor) : new Big(0);
    const adjustedExpectedOutputDecimal = oracleExpectedOutputDecimal.plus(anchorFeeInBrl);

    if (anchorFeeInBrl.gt(0)) {
      logger.info(
        `OffRampDiscountEngine: Adjusted expected BRL from ${oracleExpectedOutputDecimal.toFixed(6)} ` +
          `to ${adjustedExpectedOutputDecimal.toFixed(6)} (anchor fee: ${anchorFeeInBrl.toFixed(6)} BRL)`
      );
      ctx.addNote?.(
        `OffRampDiscountEngine: Adjusted expected BRL output from ${oracleExpectedOutputDecimal.toFixed(4)} ` +
          `to ${adjustedExpectedOutputDecimal.toFixed(4)} BRL to account for anchor fee of ${anchorFeeInBrl.toFixed(4)} BRL`
      );
    }

    const expectedOutputAmountRaw = multiplyByPowerOfTen(adjustedExpectedOutputDecimal, nablaSwap.outputDecimals).toFixed(0, 0);

    const actualOutputAmountDecimal = nablaSwap.outputAmountDecimal;
    const actualOutputAmountRaw = multiplyByPowerOfTen(actualOutputAmountDecimal, nablaSwap.outputDecimals).toFixed(0, 0);

    // Calculate ideal subsidy (uncapped - the full shortfall needed to reach adjusted expected output)
    const idealSubsidyAmountDecimal = actualOutputAmountDecimal.gte(adjustedExpectedOutputDecimal)
      ? new Big(0)
      : adjustedExpectedOutputDecimal.minus(actualOutputAmountDecimal);
    const idealSubsidyAmountRaw = multiplyByPowerOfTen(idealSubsidyAmountDecimal, nablaSwap.outputDecimals).toFixed(0, 0);

    // Calculate actual subsidy (capped by maxSubsidy)
    const actualSubsidyAmountDecimal =
      targetDiscount > 0
        ? calculateSubsidyAmount(adjustedExpectedOutputDecimal, actualOutputAmountDecimal, maxSubsidy)
        : Big(0);
    const actualSubsidyAmountRaw = multiplyByPowerOfTen(actualSubsidyAmountDecimal, nablaSwap.outputDecimals).toFixed(0, 0);

    const targetOutputAmountDecimal = actualOutputAmountDecimal.plus(actualSubsidyAmountDecimal);
    const targetOutputAmountRaw = Big(actualOutputAmountRaw).plus(actualSubsidyAmountRaw).toFixed(0, 0);

    const subsidyRate = adjustedExpectedOutputDecimal.gt(0)
      ? actualSubsidyAmountDecimal.div(adjustedExpectedOutputDecimal)
      : new Big(0);

    return {
      actualOutputAmountDecimal,
      actualOutputAmountRaw,
      adjustedDifference,
      adjustedTargetDiscount,
      expectedOutputAmountDecimal: adjustedExpectedOutputDecimal,
      expectedOutputAmountRaw,
      idealSubsidyAmountInOutputTokenDecimal: idealSubsidyAmountDecimal,
      idealSubsidyAmountInOutputTokenRaw: idealSubsidyAmountRaw,
      partnerId: partner ? partner.id : null,
      subsidyAmountInOutputTokenDecimal: actualSubsidyAmountDecimal,
      subsidyAmountInOutputTokenRaw: actualSubsidyAmountRaw,
      subsidyRate,
      targetOutputAmountDecimal,
      targetOutputAmountRaw
    };
  }
}
