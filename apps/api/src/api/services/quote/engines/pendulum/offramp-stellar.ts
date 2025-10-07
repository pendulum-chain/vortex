import { RampDirection } from "@packages/shared";
import Big from "big.js";
import { priceFeedService } from "../../../priceFeed.service";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OffRampToStellarPendulumTransferEngine implements Stage {
  readonly key = StageKey.OffRampPendulumTransfer;

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

    const amountIn = ctx.nablaSwap.outputAmountDecimal;
    const amountInRaw = ctx.nablaSwap.outputAmountRaw;
    const fee = new Big(0); // The fee is not paid in the token being transferred

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
