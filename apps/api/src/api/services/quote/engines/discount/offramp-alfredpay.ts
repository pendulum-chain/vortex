import {
  ALFREDPAY_ERC20_DECIMALS,
  ALFREDPAY_ONCHAIN_CURRENCY,
  EvmToken,
  multiplyByPowerOfTen,
  RampCurrency,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { priceFeedService } from "../../../priceFeed.service";
import { QuoteContext } from "../../core/types";
import { BaseDiscountEngine, DiscountComputation } from ".";
import {
  calculateExpectedOutput,
  calculateSubsidyAmount,
  getUsdDenominatedInputAmount,
  resolveDiscountPartner
} from "./helpers";

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
    const usdBridged = ctx.evmToEvm!.outputAmountDecimal;

    // Oracle rate FIAT -> USD (e.g., 1 ARS = 0.0002657 USD).
    // This block is required to avoid calling the Alfredpay API twice for a quote.
    // Since setting the input amount for the Alfredpay operations comes after this, and uses the output of the
    // discounted rate, we need to know or estimate the rate in advance.
    const effectiveRateStr = await priceFeedService.convertCurrency(
      "1",
      outputCurrency as RampCurrency,
      ALFREDPAY_ONCHAIN_CURRENCY as unknown as RampCurrency
    );
    const effectiveRate = new Big(effectiveRateStr);

    if (!effectiveRate.gt(0)) {
      throw new Error(
        `OffRampAlfredpayDiscountEngine: oracle returned non-positive rate (${effectiveRateStr}) for ${outputCurrency} -> ${ALFREDPAY_ONCHAIN_CURRENCY}`
      );
    }

    // Charge vortex + partner-markup fees on the USD leg before pricing the Alfredpay
    // payout: the fee residual stays on the Polygon ephemeral and is collected by the
    // distributeFees phase. Each component is derived exactly like the persisted fee
    // metadata (rounded to 2 fiat decimals via calculateFeeComponents, converted with
    // the same price-feed operation, then floored to USDT raw units PER COMPONENT like
    // computeFeeComponentRaws), so the residual left after the deposit reconciles with
    // the distributeFees transfers.
    const feeCurrency = ctx.preNabla?.feeCurrency ?? (outputCurrency as RampCurrency);
    const componentToRaw = async (component: Big): Promise<Big> => {
      const componentUsd = await priceFeedService.convertCurrency(
        component.round(2).toString(),
        feeCurrency,
        EvmToken.USDC as RampCurrency
      );
      return new Big(multiplyByPowerOfTen(componentUsd, ALFREDPAY_ERC20_DECIMALS).toFixed(0, 0));
    };
    const vortexFeeRaw = await componentToRaw(ctx.preNabla?.vortexFeeInFeeCurrency ?? new Big(0));
    const partnerMarkupRaw = await componentToRaw(ctx.preNabla?.partnerMarkupFeeInFeeCurrency ?? new Big(0));
    const deductibleFee = vortexFeeRaw.plus(partnerMarkupRaw).div(new Big(10).pow(ALFREDPAY_ERC20_DECIMALS));
    const usdOnPolygon = usdBridged.minus(deductibleFee);
    if (usdOnPolygon.lte(0)) {
      throw new APIError({
        message: "Input amount too low to cover calculated fees",
        status: httpStatus.BAD_REQUEST
      });
    }

    // finalOutput uses the inverted rate (USD -> FIAT) for display/logging
    const usdToFiatRate = new Big(1).div(effectiveRate);
    const finalOutput = usdOnPolygon.mul(usdToFiatRate);

    // The inverted rate converts USD -> fiat, so a non-USD input (e.g. BRLA) must be valued in USD first.
    const inputAmountUsd = await getUsdDenominatedInputAmount(ctx);
    if (!inputAmountUsd.eq(inputAmount)) {
      ctx.addNote?.(
        `OffRampAlfredpayDiscountEngine: valued input ${inputAmount} ${ctx.request.inputCurrency} at ${inputAmountUsd.toFixed(6)} USD for discount calculation`
      );
    }

    const {
      expectedOutput: grossExpectedOutput,
      adjustedDifference,
      adjustedTargetDiscount
    } = calculateExpectedOutput(inputAmountUsd.toString(), effectiveRate, targetDiscount, this.config.isOfframp, partner);

    // Subsidization must not bypass fee collection: the subsidy targets the discounted
    // rate NET of the charged vortex/partner fees (valued in the fiat output), so a
    // subsidy can never refill a fee that was just deducted from the USD leg.
    const expectedOutputDecimal = grossExpectedOutput.minus(deductibleFee.mul(usdToFiatRate));

    const idealSubsidyDecimal = expectedOutputDecimal.gt(finalOutput) ? expectedOutputDecimal.minus(finalOutput) : new Big(0);

    const actualSubsidyDecimal =
      targetDiscount !== 0 ? calculateSubsidyAmount(expectedOutputDecimal, finalOutput, maxSubsidy) : new Big(0);

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
