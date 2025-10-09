import {
  AssetHubToken,
  FiatToken,
  getAnyFiatTokenDetails,
  getPendulumDetails,
  Networks,
  PENDULUM_USDC_AXL,
  RampCurrency,
  RampDirection
} from "@packages/shared";
import { Big } from "big.js";
import { QuoteContext } from "../../core/types";
import { BaseNablaSwapEngine, NablaSwapComputation } from "./index";

export class OffRampSwapEngine extends BaseNablaSwapEngine {
  readonly config = {
    direction: RampDirection.SELL,
    skipNote: "Skipped for on-ramp request"
  } as const;

  protected validate(ctx: QuoteContext): void {
    if (!ctx.preNabla?.deductibleFeeAmountInSwapCurrency) {
      throw new Error("Missing deductible fee amount from preNabla");
    }
  }

  protected compute(ctx: QuoteContext): NablaSwapComputation {
    const { request } = ctx;

    const inputAmountPreFees =
      request.from === "assethub" ? ctx.assethubToPendulumXcm?.outputAmountDecimal : ctx.evmToPendulum?.outputAmountDecimal;
    if (!inputAmountPreFees) {
      throw new Error("OffRampSwapEngine: Missing input amount from previous stage");
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
