import { getPendulumDetails, RampDirection } from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { priceFeedService } from "../../../priceFeed.service";
import { calculatePreNablaDeductibleFees } from "../../core/quote-fees";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampInitializeMoneriumEngine implements Stage {
  readonly key = StageKey.OnRampInitialize;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("Skipped for off-ramp request");
      return;
    }

    // Calculate Monerium input and output (of minting/deposit)
    const amountIn = new Big(req.inputAmount);
    const moneriumFee = Big(0);
    const amountOut = amountIn.minus(moneriumFee);

    ctx.moneriumMint = {
      amountIn,
      amountOut,
      currency: ctx.request.inputCurrency,
      fee: moneriumFee
    };

    ctx.addNote?.(
      `Initialized: ${amountIn.toString()} ${req.inputCurrency} -> ${amountOut.toString()} ${req.outputCurrency} (fee: ${moneriumFee.toString()})`
    );
  }
}
