import {
  AXL_USDC_MOONBEAM,
  getNetworkFromDestination,
  Networks,
  OnChainToken,
  RampCurrency,
  RampDirection
} from "@packages/shared";
import { calculateFeeComponents } from "../../core/quote-fees";
import { calculateEvmBridgeAndNetworkFee, getTokenDetailsForEvmDestination } from "../../core/squidrouter";
import { QuoteContext, Stage, StageKey } from "../../core/types";
import { assignFeeSummary } from "./index";

export class OnRampAveniaToAssethubFeeEngine implements Stage {
  readonly key = StageKey.Fee;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("Skipped for off-ramp request");
      return;
    }

    if (!ctx.aveniaMint) {
      throw new Error("OnRampFeeAveniaToAssethubEngine requires aveniaMint in context");
    }

    const { feeCurrency, partnerMarkupFee, vortexFee } = await calculateFeeComponents({
      from: req.from,
      inputAmount: req.inputAmount,
      inputCurrency: req.inputCurrency,
      outputCurrency: req.outputCurrency,
      partnerName: ctx.partner?.id || undefined,
      rampType: req.rampType,
      to: req.to
    });

    const anchorFee = ctx.aveniaMint.fee.toString();
    const anchorFeeCurrency = ctx.aveniaMint.currency as RampCurrency;

    const toNetwork = getNetworkFromDestination(req.to);
    if (!toNetwork) {
      throw new Error(`OnRampFeeAveniaToAssethubEngine: invalid network for destination: ${req.to}`);
    }

    void getTokenDetailsForEvmDestination(req.outputCurrency as OnChainToken, toNetwork);

    const networkFeeUsd = "0.03"; // FIXME We don't have a good estimate for XCM fees yet

    await assignFeeSummary(ctx, {
      anchor: { amount: anchorFee, currency: anchorFeeCurrency },
      network: { amount: networkFeeUsd, currency: "USD" as RampCurrency },
      partnerMarkup: { amount: partnerMarkupFee, currency: feeCurrency },
      vortex: { amount: vortexFee, currency: feeCurrency }
    });
  }
}
