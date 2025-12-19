import { multiplyByPowerOfTen, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
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

    // Calculate expected output amount based on oracle price + target discount
    const {
      expectedOutput: expectedOutputAmountDecimal,
      adjustedDifference,
      adjustedTargetDiscount
    } = calculateExpectedOutput(inputAmount, oraclePrice, targetDiscount, this.config.isOfframp, partner);
    const expectedOutputAmountRaw = multiplyByPowerOfTen(expectedOutputAmountDecimal, nablaSwap.outputDecimals).toFixed(0, 0);

    const actualOutputAmountDecimal = nablaSwap.outputAmountDecimal;
    const actualOutputAmountRaw = multiplyByPowerOfTen(actualOutputAmountDecimal, nablaSwap.outputDecimals).toFixed(0, 0);

    // Calculate ideal subsidy (uncapped - the full shortfall needed to reach expected output)
    const idealSubsidyAmountDecimal = actualOutputAmountDecimal.gte(expectedOutputAmountDecimal)
      ? new Big(0)
      : expectedOutputAmountDecimal.minus(actualOutputAmountDecimal);
    const idealSubsidyAmountRaw = multiplyByPowerOfTen(idealSubsidyAmountDecimal, nablaSwap.outputDecimals).toFixed(0, 0);

    // Calculate actual subsidy (capped by maxSubsidy)
    const actualSubsidyAmountDecimal =
      targetDiscount > 0 ? calculateSubsidyAmount(expectedOutputAmountDecimal, actualOutputAmountDecimal, maxSubsidy) : Big(0);
    const actualSubsidyAmountRaw = multiplyByPowerOfTen(actualSubsidyAmountDecimal, nablaSwap.outputDecimals).toFixed(0, 0);

    const targetOutputAmountDecimal = actualOutputAmountDecimal.plus(actualSubsidyAmountDecimal);
    const targetOutputAmountRaw = Big(actualOutputAmountRaw).plus(actualSubsidyAmountRaw).toFixed(0, 0);

    const subsidyRate = expectedOutputAmountDecimal.gt(0)
      ? actualSubsidyAmountDecimal.div(expectedOutputAmountDecimal)
      : new Big(0);

    return {
      actualOutputAmountDecimal,
      actualOutputAmountRaw,
      adjustedDifference,
      adjustedTargetDiscount,
      expectedOutputAmountDecimal,
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
