import { getNetworkFromDestination, RampCurrency, RampDirection } from "@vortexfi/shared";
import { QuoteContext } from "../../core/types";
import { BaseFeeEngine, FeeComputation, FeeConfig } from "./index";

export class OnRampAveniaToAssethubFeeEngine extends BaseFeeEngine {
  readonly config: FeeConfig = {
    direction: RampDirection.BUY,
    skipNote: "Skipped for off-ramp request"
  };

  protected validate(ctx: QuoteContext): void {
    if (!ctx.aveniaMint) {
      throw new Error("OnRampFeeAveniaToAssethubEngine requires aveniaMint in context");
    }
  }

  protected async compute(ctx: QuoteContext, anchorFee: string, feeCurrency: RampCurrency): Promise<FeeComputation> {
    const { request } = ctx;

    // biome-ignore lint/style/noNonNullAssertion: Context is validated in `validate`
    const computedAnchorFee = ctx.aveniaMint!.fee.toString();
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in `validate`
    const anchorFeeCurrency = ctx.aveniaMint!.currency as RampCurrency;

    const toNetwork = getNetworkFromDestination(request.to);
    if (!toNetwork) {
      throw new Error(`OnRampFeeAveniaToAssethubEngine: invalid network for destination: ${request.to}`);
    }

    const networkFeeUsd = "0.03"; // FIXME We don't have a good estimate for XCM fees yet

    return {
      anchor: { amount: computedAnchorFee, currency: anchorFeeCurrency },
      network: { amount: networkFeeUsd, currency: "USD" as RampCurrency }
    };
  }
}
