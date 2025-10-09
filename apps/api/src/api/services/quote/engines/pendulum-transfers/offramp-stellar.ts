import { RampDirection } from "@packages/shared";
import Big from "big.js";
import { QuoteContext } from "../../core/types";
import { BasePendulumTransferEngine, PendulumTransferComputation, PendulumTransferConfig, StellarData } from "./index";

export class OffRampToStellarPendulumTransferEngine extends BasePendulumTransferEngine {
  readonly config: PendulumTransferConfig = {
    direction: RampDirection.SELL,
    skipNote: "Skipped for off-ramp request"
  };

  protected validate(ctx: QuoteContext): void {
    if (!ctx.nablaSwap) {
      throw new Error("OffRampToStellarPendulumTransferEngine requires nablaSwap in context");
    }

    if (!ctx.subsidy) {
      throw new Error("OffRampToStellarPendulumTransferEngine requires subsidy in context");
    }
  }

  protected async compute(ctx: QuoteContext): Promise<PendulumTransferComputation> {
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const nablaSwap = ctx.nablaSwap!;

    const fee = new Big(0); // The fee is not paid in the token being transferred
    const amountIn = this.mergeSubsidy(ctx, new Big(nablaSwap.outputAmountDecimal));
    const amountInRaw = this.mergeSubsidyRaw(ctx, new Big(nablaSwap.outputAmountRaw)).toFixed(0, 0);

    const stellarData: StellarData = {
      amountIn,
      amountInRaw,
      amountOut: amountIn, // The fees are not paid in the token being transferred, so amountOut = amountIn
      amountOutRaw: amountInRaw,
      currency: nablaSwap.outputCurrency,
      fee
    };

    return {
      data: stellarData,
      type: "stellar"
    };
  }

  protected assign(ctx: QuoteContext, computation: PendulumTransferComputation): void {
    ctx.pendulumToStellar = computation.data as StellarData;
  }
}
