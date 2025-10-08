import { RampDirection } from "@packages/shared";
import Big from "big.js";
import { priceFeedService } from "../../../priceFeed.service";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OffRampToStellarPendulumTransferEngine implements Stage {
  readonly key = StageKey.PendulumTransfer;

  private price = priceFeedService;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.SELL) {
      ctx.addNote?.("Skipped for off-ramp request");
      return;
    }

    if (!ctx.nablaSwap) {
      throw new Error("OnRampPendulumTransferEngine requires nablaSwap in context");
    }

    if (!ctx.subsidy) {
      throw new Error("OnRampPendulumTransferEngine requires subsidy in context");
    }

    const fee = new Big(0); // The fee is not paid in the token being transferred
    const amountIn = ctx.nablaSwap.outputAmountDecimal.plus(ctx.subsidy.subsidyAmountInOutputToken);
    const amountInRaw = new Big(ctx.nablaSwap.outputAmountRaw).plus(ctx.subsidy.subsidyAmountInOutputTokenRaw).toFixed(0, 0);

    ctx.pendulumToStellar = {
      amountIn,
      amountInRaw,
      amountOut: amountIn, // The fees are not paid in the token being transferred, so amountOut = amountIn
      amountOutRaw: amountInRaw,
      currency: ctx.nablaSwap.outputCurrency,
      fee
    };

    ctx.addNote?.(``);
  }
}
