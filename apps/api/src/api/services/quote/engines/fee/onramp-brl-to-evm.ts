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
import { assignFeeSummary, FeeSummaryInput } from "./index";

export class OnRampAveniaToEvmFeeEngine implements Stage {
  readonly key = StageKey.Fee;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("Skipped for off-ramp request");
      return;
    }

    if (!ctx.aveniaMint) {
      throw new Error("OnRampFeeAveniaToEvmEngine requires aveniaMint in context");
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
      throw new Error(`OnRampAveniaToEvmFeeEngine: invalid network for destination: ${req.to}`);
    }

    const toToken = getTokenDetailsForEvmDestination(req.outputCurrency as OnChainToken, toNetwork).erc20AddressSourceChain;

    const bridgeResult = await calculateEvmBridgeAndNetworkFee({
      amountRaw: req.inputAmount,
      fromNetwork: Networks.Moonbeam,
      fromToken: AXL_USDC_MOONBEAM,
      originalInputAmountForRateCalc: req.inputAmount,
      rampType: req.rampType,
      toNetwork,
      toToken
    });

    const components: FeeSummaryInput = {
      anchor: { amount: anchorFee, currency: anchorFeeCurrency },
      network: { amount: bridgeResult.networkFeeUSD, currency: "USD" as RampCurrency },
      partnerMarkup: { amount: partnerMarkupFee, currency: feeCurrency },
      vortex: { amount: vortexFee, currency: feeCurrency }
    };

    await assignFeeSummary(ctx, components);
  }
}
