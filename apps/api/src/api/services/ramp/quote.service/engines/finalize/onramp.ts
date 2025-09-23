import { FiatToken, QuoteResponse, RampCurrency, RampDirection } from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import { APIError } from "../../../../../errors/api-error";
import { PriceFeedAdapter } from "../../adapters/price-feed-adapter";
import { trimTrailingZeros } from "../../helpers";
import { QuoteContext, Stage, StageKey } from "../../types";
import { validateAmountLimits } from "../../validation-helpers";

export class OnRampFinalizeEngine implements Stage {
  readonly key = StageKey.OnRampFinalize;

  private price = new PriceFeedAdapter();

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("OnRampFinalizeEngine: skipped for off-ramp request");
      return;
    }

    if (!ctx.nabla?.outputAmountDecimal) {
      throw new APIError({ message: "OnRampFinalizeEngine requires Nabla output", status: httpStatus.INTERNAL_SERVER_ERROR });
    }
    if (!ctx.fees?.displayFiat?.total || !ctx.fees?.usd) {
      throw new APIError({ message: "OnRampFinalizeEngine requires computed fees", status: httpStatus.INTERNAL_SERVER_ERROR });
    }
    if (!ctx.preNabla?.deductibleFeeAmount || !ctx.preNabla?.feeCurrency) {
      throw new APIError({
        message: "OnRampFinalizeEngine requires pre-Nabla fee data",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    let finalGrossOutputAmountDecimal: Big;
    if (req.to === "assethub") {
      finalGrossOutputAmountDecimal = new Big(ctx.nabla.outputAmountDecimal);
    } else {
      if (!ctx.bridge?.finalGrossOutputAmountDecimal) {
        throw new APIError({
          message: "OnRampFinalizeEngine requires bridge output for EVM",
          status: httpStatus.INTERNAL_SERVER_ERROR
        });
      }
      finalGrossOutputAmountDecimal = new Big(ctx.bridge.finalGrossOutputAmountDecimal);
    }

    const display = ctx.fees.displayFiat;
    const totalFeeFiat = new Big(display.total);

    const preNablaInDisplayFiat = await this.price.convertCurrency(
      ctx.preNabla.deductibleFeeAmount.toString(),
      ctx.preNabla.feeCurrency as RampCurrency,
      display.currency as RampCurrency
    );
    const adjustedTotalFeeFiat = totalFeeFiat.minus(preNablaInDisplayFiat);

    let finalNetOutputAmount: Big;
    if (req.to === "assethub") {
      const totalFeeInOutputCurrency = await this.price.convertCurrency(
        adjustedTotalFeeFiat.toString(),
        display.currency,
        req.outputCurrency
      );
      finalNetOutputAmount = finalGrossOutputAmountDecimal.minus(totalFeeInOutputCurrency);
    } else {
      finalNetOutputAmount = finalGrossOutputAmountDecimal;
    }

    if (finalNetOutputAmount.lte(0)) {
      throw new APIError({
        message: "Input amount too low to cover calculated fees",
        status: httpStatus.BAD_REQUEST
      });
    }

    validateAmountLimits(req.inputAmount, req.inputCurrency as FiatToken, "min", req.rampType);

    let discountSubsidyAmount = new Big(0);

    if (ctx.discount?.applied && ctx.discount.rate) {
      const rate = new Big(ctx.discount.rate);
      discountSubsidyAmount = finalNetOutputAmount.mul(rate);
      finalNetOutputAmount = finalNetOutputAmount.plus(discountSubsidyAmount);

      ctx.discount.subsidyAmountInOutputToken = discountSubsidyAmount.toFixed(6, 0);
    }

    const outputAmountStr = finalNetOutputAmount.toFixed(6, 0);

    const record = await QuoteTicket.create({
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      fee: ctx.fees.displayFiat,
      from: req.from,
      inputAmount: req.inputAmount,
      inputCurrency: req.inputCurrency,
      metadata: ctx,
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
    ctx.addNote?.("OnRampFinalizeEngine: persisted quote and built response");
  }
}
