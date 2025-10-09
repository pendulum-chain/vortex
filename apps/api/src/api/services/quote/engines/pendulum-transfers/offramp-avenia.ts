import { multiplyByPowerOfTen, RampDirection } from "@packages/shared";
import Big from "big.js";
import { QuoteContext, XcmMeta } from "../../core/types";
import { BasePendulumTransferEngine, PendulumTransferComputation, PendulumTransferConfig } from "./index";

export class OffRampToAveniaPendulumTransferEngine extends BasePendulumTransferEngine {
  readonly config: PendulumTransferConfig = {
    direction: RampDirection.SELL,
    skipNote: "Skipped for off-ramp request"
  };

  protected validate(ctx: QuoteContext): void {
    if (!ctx.nablaSwap) {
      throw new Error("OffRampToAveniaPendulumTransferEngine requires nablaSwap in context");
    }

    if (!ctx.subsidy) {
      throw new Error("OffRampToAveniaPendulumTransferEngine requires subsidy in context");
    }
  }

  protected async compute(ctx: QuoteContext): Promise<PendulumTransferComputation> {
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const nablaSwap = ctx.nablaSwap!;

    const xcmFees = this.createXcmFees(ctx);

    // We don't need to deduct the XCM fees from the output amount because the fees are not paid in the token
    // being transferred but in GLMR
    const outputAmountDecimal = this.mergeSubsidy(ctx, new Big(nablaSwap.outputAmountDecimal));
    const outputAmountRaw = multiplyByPowerOfTen(outputAmountDecimal, nablaSwap.outputDecimals).toString();

    const xcmMeta: XcmMeta = {
      fromToken: nablaSwap.outputCurrency,
      inputAmountDecimal: nablaSwap.outputAmountDecimal,
      inputAmountRaw: nablaSwap.outputAmountRaw,
      outputAmountDecimal,
      outputAmountRaw,
      toToken: nablaSwap.outputCurrency,
      xcmFees
    };

    return {
      data: xcmMeta,
      type: "xcm"
    };
  }

  protected assign(ctx: QuoteContext, computation: PendulumTransferComputation): void {
    ctx.pendulumToMoonbeamXcm = computation.data as XcmMeta;
  }
}
