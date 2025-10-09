import { AssetHubToken, FiatToken, getPendulumDetails, Networks, PENDULUM_USDC_AXL, RampDirection } from "@packages/shared";
import { Big } from "big.js";
import { QuoteContext } from "../../core/types";
import { BaseNablaSwapEngine, NablaSwapComputation } from "./index";

export class OnRampSwapEngine extends BaseNablaSwapEngine {
  readonly config = {
    direction: RampDirection.BUY,
    skipNote: "Skipped for off-ramp request"
  } as const;

  protected validate(ctx: QuoteContext): void {
    if (!ctx.fees?.usd) {
      throw new Error("Fees in USD must be calculated first");
    }
  }

  protected compute(ctx: QuoteContext): NablaSwapComputation {
    const { request } = ctx;

    let amountReceivedOnPendulum: Big;
    if (ctx.evmToMoonbeam) {
      // Amount received on Pendulum via Squidrouter postcall hook
      amountReceivedOnPendulum = ctx.evmToMoonbeam.outputAmountDecimal;
    } else if (ctx.moonbeamToPendulumXcm) {
      amountReceivedOnPendulum = ctx.moonbeamToPendulumXcm.outputAmountDecimal;
    } else {
      throw new Error("OnRampSwapEngine: Missing evmToMoonbeam or moonbeamToPendulumXcm quote data from previous stage");
    }

    const inputTokenPendulumDetails = request.from === "pix" ? getPendulumDetails(FiatToken.BRL) : PENDULUM_USDC_AXL;
    const outputTokenPendulumDetails =
      request.to === "assethub" ? getPendulumDetails(AssetHubToken.USDC, Networks.AssetHub) : PENDULUM_USDC_AXL;

    return {
      inputAmountPreFees: amountReceivedOnPendulum,
      inputTokenPendulumDetails,
      outputTokenPendulumDetails
    };
  }
}
