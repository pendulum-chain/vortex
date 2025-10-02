import { FiatToken, QuoteResponse, RampCurrency, RampDirection } from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import { APIError } from "../../../../errors/api-error";
import { priceFeedService } from "../../../priceFeed.service";
import { trimTrailingZeros } from "../../core/helpers";
import { QuoteContext, Stage, StageKey } from "../../core/types";
import { validateAmountLimits } from "../../core/validation-helpers";

export class OffRampFinalizeEngine implements Stage {
  readonly key = StageKey.OffRampFinalize;

  private price = priceFeedService;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.SELL) {
      ctx.addNote?.("OffRampFinalizeEngine: skipped for on-ramp request");
      return;
    }

    if (!ctx.nablaSwap?.outputAmountDecimal) {
      throw new APIError({ message: "OffRampFinalizeEngine requires Nabla output", status: httpStatus.INTERNAL_SERVER_ERROR });
    }
    if (!ctx.fees?.displayFiat?.total || !ctx.fees?.usd) {
      throw new APIError({
        message: "OffRampFinalizeEngine requires computed fees",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }
    if (!ctx.preNabla?.deductibleFeeAmount || !ctx.preNabla?.feeCurrency) {
      throw new APIError({
        message: "OffRampFinalizeEngine requires pre-Nabla fee data",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    const finalGrossOutputAmountDecimal = new Big(ctx.nablaSwap.outputAmountDecimal);

    const display = ctx.fees.displayFiat;
    const totalFeeFiat = new Big(display.total);

    const preNablaInDisplayFiat = await this.price.convertCurrency(
      ctx.preNabla.deductibleFeeAmount.toString(),
      ctx.preNabla.feeCurrency as RampCurrency,
      display.currency as RampCurrency
    );
    const adjustedTotalFeeFiat = totalFeeFiat.minus(preNablaInDisplayFiat);

    const totalFeeInOutputFiat = await this.price.convertCurrency(
      adjustedTotalFeeFiat.toString(),
      display.currency,
      req.outputCurrency
    );
    const finalNetOutputAmount = finalGrossOutputAmountDecimal.minus(totalFeeInOutputFiat);

    if (finalNetOutputAmount.lte(0)) {
      throw new APIError({
        message: "Input amount too low to cover calculated fees",
        status: httpStatus.BAD_REQUEST
      });
    }

    validateAmountLimits(finalNetOutputAmount, req.outputCurrency as FiatToken, "min", req.rampType);

    const outputAmountStr = finalNetOutputAmount.toFixed(2, 0);

    const offrampAmountBeforeAnchorFees = new Big(outputAmountStr).plus(display.anchor).toFixed();

    const record = await QuoteTicket.create({
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      fee: ctx.fees.displayFiat,
      from: req.from,
      inputAmount: req.inputAmount,
      inputCurrency: req.inputCurrency,
      metadata: { ...ctx, offrampAmountBeforeAnchorFees },
      outputAmount: outputAmountStr,
      outputCurrency: req.outputCurrency,
      partnerId: ctx.partner?.id || null,
      rampType: req.rampType,
      status: "pending",
      to: req.to
    });

    ctx.builtResponse = {
      expiresAt: record.expiresAt,
      fee: ctx.fees.displayFiat,
      from: record.from,
      id: record.id,
      inputAmount: trimTrailingZeros(record.inputAmount),
      inputCurrency: record.inputCurrency,
      outputAmount: trimTrailingZeros(outputAmountStr),
      outputCurrency: record.outputCurrency,
      rampType: record.rampType,
      to: record.to
    };
    ctx.addNote?.("OffRampFinalizeEngine: persisted quote and built response");
  }
}
