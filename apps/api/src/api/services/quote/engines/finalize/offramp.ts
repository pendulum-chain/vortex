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
    if (!ctx.fees?.displayFiat?.anchor) {
      throw new APIError({
        message: "OffRampFinalizeEngine requires computed anchor fees",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    const anchorFee = ctx.fees.displayFiat.anchor;
    const offrampAmountBeforeAnchorFees = ctx.nablaSwap.outputAmountDecimal.toString();
    const finalNetOutputAmount = new Big(offrampAmountBeforeAnchorFees).minus(anchorFee);
    const outputAmountString = finalNetOutputAmount.toFixed(2, 0);

    validateAmountLimits(finalNetOutputAmount, req.outputCurrency as FiatToken, "min", req.rampType);

    const record = await QuoteTicket.create({
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      fee: ctx.fees.displayFiat,
      from: req.from,
      inputAmount: req.inputAmount,
      inputCurrency: req.inputCurrency,
      metadata: { ...ctx, offrampAmountBeforeAnchorFees },
      outputAmount: outputAmountString,
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
      outputAmount: trimTrailingZeros(outputAmountString),
      outputCurrency: record.outputCurrency,
      rampType: record.rampType,
      to: record.to
    };
    ctx.addNote?.("OffRampFinalizeEngine: persisted quote and built response");
  }
}
