import { RampDirection } from "@packages/shared";
import Big from "big.js";
import { QuoteContext, StellarMeta } from "../../core/types";
import { BasePendulumTransferEngine, PendulumTransferComputation, PendulumTransferConfig } from "./index";

export class OffRampToStellarPendulumTransferEngine extends BasePendulumTransferEngine {
  readonly config: PendulumTransferConfig = {
    direction: RampDirection.SELL,
    skipNote:
      "OffRampToStellarPendulumTransferEngine: Skipped because rampType is BUY, this engine handles SELL operations only"
  };

  protected validate(ctx: QuoteContext): void {
    if (!ctx.nablaSwap) {
      throw new Error(
        "OffRampToStellarPendulumTransferEngine: Missing nablaSwap in context - ensure nabla-swap stage ran successfully"
      );
    }

    if (!ctx.subsidy) {
      throw new Error(
        "OffRampToStellarPendulumTransferEngine: Missing subsidy in context - ensure subsidy calculation ran successfully"
      );
    }
  }

  protected async compute(ctx: QuoteContext): Promise<PendulumTransferComputation> {
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const nablaSwap = ctx.nablaSwap!;

    const fee = new Big(0); // The fee is not paid in the token being transferred

    // Trim the amounts to 2 decimals as higher precision is irrelevant for the fiat anchors
    const inputAmountDecimal = this.mergeSubsidy(ctx, new Big(nablaSwap.outputAmountDecimal)).round(2, Big.roundDown);
    const inputAmountRaw = inputAmountDecimal.mul(new Big(10).pow(nablaSwap.outputDecimals)).toFixed(0, 0);

    const stellarData: StellarMeta = {
      currency: nablaSwap.outputCurrency,
      fee,
      inputAmountDecimal,
      inputAmountRaw,
      // The fees are not paid in the token being transferred, so amountOut = amountIn
      outputAmountDecimal: inputAmountDecimal,
      outputAmountRaw: inputAmountRaw
    };

    return {
      data: stellarData,
      type: "stellar"
    };
  }

  protected assign(ctx: QuoteContext, computation: PendulumTransferComputation): void {
    ctx.pendulumToStellar = computation.data as StellarMeta;
  }
}
