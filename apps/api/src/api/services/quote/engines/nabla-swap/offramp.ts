import { FiatToken, getPendulumDetails, Networks, PENDULUM_USDC_AXL, RampDirection } from "@packages/shared";
import { QuoteContext } from "../../core/types";
import { BaseNablaSwapEngine, NablaSwapComputation } from "./index";

export class OffRampSwapEngine extends BaseNablaSwapEngine {
  readonly config = {
    direction: RampDirection.SELL,
    skipNote: "OffRampSwapEngine: Skipped because rampType is BUY, this engine handles SELL operations only"
  } as const;

  protected validate(ctx: QuoteContext): void {
    if (!ctx.preNabla?.deductibleFeeAmountInSwapCurrency) {
      throw new Error(
        "OffRampSwapEngine: Missing deductibleFeeAmountInSwapCurrency in preNabla context - ensure initialize stage ran successfully"
      );
    }
  }

  protected compute(ctx: QuoteContext): NablaSwapComputation {
    const { request } = ctx;

    const inputAmountPreFees =
      request.from === "assethub" ? ctx.assethubToPendulumXcm?.outputAmountDecimal : ctx.evmToPendulum?.outputAmountDecimal;
    if (!inputAmountPreFees) {
      throw new Error("OffRampSwapEngine: Missing input amount from previous stage - ensure initialize stage ran successfully");
    }

    const inputTokenPendulumDetails =
      request.from === "assethub" ? getPendulumDetails(request.inputCurrency, Networks.AssetHub) : PENDULUM_USDC_AXL;
    const outputTokenPendulumDetails = getPendulumDetails(request.outputCurrency as FiatToken);

    return {
      inputAmountPreFees,
      inputTokenPendulumDetails,
      outputTokenPendulumDetails
    };
  }
}
