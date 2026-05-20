import {
  ALFREDPAY_ERC20_DECIMALS,
  ALFREDPAY_ONCHAIN_CURRENCY,
  multiplyByPowerOfTen,
  RampCurrency,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import { priceFeedService } from "../../../priceFeed.service";
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
    if (!ctx.evmToEvm) {
      throw new Error("OffRampAlfredpayDiscountEngine requires evmToEvm to be defined");
    }

    if (!ctx.request.inputAmount) {
      throw new Error("OffRampAlfredpayDiscountEngine requires request.inputAmount to be defined");
    }
  }

  protected async compute(ctx: QuoteContext): Promise<DiscountComputation> {
    const { inputAmount, outputCurrency, rampType } = ctx.request;

    const partner = await resolveDiscountPartner(ctx, rampType);
    const targetDiscount = partner?.targetDiscount ?? 0;
    const maxSubsidy = partner?.maxSubsidy ?? 0;

    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const usdOnPolygon = ctx.evmToEvm!.outputAmountDecimal;

    // Oracle rate USD -> fiat.
    // This block is required to avoid calling the Alfredpay API twice for a quote.
    // Since the input amount for the Alfredpay operations comes after this, and uses the output of the
    // discounted rate, we need to know or estimate the rate in advance.
    const oneUnitInFiat = await priceFeedService.convertCurrency(
      "1",
      ALFREDPAY_ONCHAIN_CURRENCY as unknown as RampCurrency,
      outputCurrency as RampCurrency
    );
    const effectiveRate = new Big(oneUnitInFiat);

    const finalOutput = usdOnPolygon.mul(effectiveRate);

    console.log(
      `[OffRampAlfredpayDiscountEngine] input=${inputAmount} ${outputCurrency}, usdOnPolygon=${usdOnPolygon.toString()}, oracleRate=${effectiveRate.toString()}, finalOutput=${finalOutput.toString()} ${outputCurrency}`
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

    console.log(
      `[OffRampAlfredpayDiscountEngine] partner=${partner?.id ?? "none"}, targetDiscount=${targetDiscount}, maxSubsidy=${maxSubsidy}, expectedOutput=${expectedOutputDecimal.toString()}, idealSubsidy=${idealSubsidyDecimal.toString()}, actualSubsidy=${actualSubsidyDecimal.toString()}, targetOutput=${targetOutputDecimal.toString()}, subsidyRate=${subsidyRate.toString()}`
    );

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
