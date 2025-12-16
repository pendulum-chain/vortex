import { multiplyByPowerOfTen, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { QuoteContext } from "../../core/types";
import { BaseDiscountEngine, DiscountComputation } from ".";
import { calculateExpectedOutput, calculateSubsidyAmount, resolveDiscountPartner } from "./helpers";

export class OnRampDiscountEngine extends BaseDiscountEngine {
  readonly config = {
    direction: RampDirection.BUY,
    isOfframp: false,
    skipNote: "Skipped for off-ramp request"
  } as const;

  protected validate(ctx: QuoteContext): void {
    if (!ctx.nablaSwap) {
      throw new Error("OnRampDiscountEngine requires nablaSwap to be defined");
    }

    if (!ctx.nablaSwap.oraclePrice) {
      throw new Error("OnRampDiscountEngine requires nablaSwap.oraclePrice to be defined");
    }

    if (!ctx.request.inputAmount) {
      throw new Error("OnRampDiscountEngine requires request.inputAmount to be defined");
    }

    if (!ctx.fees?.usd) {
      throw new Error("OnRampDiscountEngine requires fees.usd to be defined");
    }
  }

  protected async compute(ctx: QuoteContext): Promise<DiscountComputation> {
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const nablaSwap = ctx.nablaSwap!;
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const oraclePrice = nablaSwap.oraclePrice!;
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const usdFees = ctx.fees!.usd!;

    const { inputAmount, rampType } = ctx.request;

    const partner = await resolveDiscountPartner(ctx, rampType);
    const targetDiscount = partner?.targetDiscount ?? 0;
    const maxSubsidy = partner?.maxSubsidy ?? 0;

    // Calculate expected output amount based on oracle price + target discount
    const expectedOutputAmountDecimal = calculateExpectedOutput(
      inputAmount,
      oraclePrice,
      targetDiscount,
      this.config.isOfframp,
      partner?.id
    );
    const expectedOutputAmountRaw = multiplyByPowerOfTen(expectedOutputAmountDecimal, nablaSwap.outputDecimals).toFixed(0, 0);

    // For onramps, we have to deduct the fees from the output amount of the nabla swap
    const deductedFeesAfterSwap = Big(usdFees.network).plus(usdFees.vortex).plus(usdFees.partnerMarkup);
    const actualOutputAmountDecimal = nablaSwap.outputAmountDecimal.minus(deductedFeesAfterSwap);
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
