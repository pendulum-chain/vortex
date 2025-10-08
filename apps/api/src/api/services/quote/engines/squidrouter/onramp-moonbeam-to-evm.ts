import { AXL_USDC_MOONBEAM, getNetworkFromDestination, Networks, OnChainToken, RampDirection } from "@packages/shared";
import Big from "big.js";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { calculateEvmBridgeAndNetworkFee, EvmBridgeRequest, getTokenDetailsForEvmDestination } from "../../core/squidrouter";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampSquidRouterBrlToEvmEngine implements Stage {
  readonly key = StageKey.SquidRouter;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY || req.to === "assethub") {
      ctx.addNote?.("OnRampSquidRouterBrlToEvmEngine: skipped");
      return;
    }

    if (!ctx.pendulumToMoonbeamXcm) {
      throw new Error("OnRampSquidRouterBrlToEvmEngine requires Nabla output in context");
    }

    const toNetwork = getNetworkFromDestination(req.to);
    if (!toNetwork) {
      throw new Error(`OnRampSquidRouterBrlToEvmEngine: invalid network for destination: ${req.to}`);
    }

    const toToken = getTokenDetailsForEvmDestination(req.outputCurrency as OnChainToken, toNetwork).erc20AddressSourceChain;

    const bridgeRequest: EvmBridgeRequest = {
      amountRaw: ctx.pendulumToMoonbeamXcm.outputAmountRaw,
      fromNetwork: Networks.Moonbeam,
      fromToken: AXL_USDC_MOONBEAM,
      originalInputAmountForRateCalc: ctx.pendulumToMoonbeamXcm.outputAmountRaw,
      rampType: req.rampType,
      toNetwork,
      toToken
    };

    const bridgeResult = await calculateEvmBridgeAndNetworkFee(bridgeRequest);
    const outputAmountDecimal = new Big(bridgeResult.finalGrossOutputAmountDecimal);
    const outputAmountRaw = multiplyByPowerOfTen(outputAmountDecimal, bridgeResult.outputTokenDecimals).toString();

    ctx.moonbeamToEvm = {
      effectiveExchangeRate: "",
      inputAmountDecimal: ctx.pendulumToMoonbeamXcm.outputAmountDecimal,
      inputAmountRaw: ctx.pendulumToMoonbeamXcm.outputAmountRaw,
      networkFeeUSD: bridgeResult.networkFeeUSD,
      outputAmountDecimal,
      outputAmountRaw,
      ...bridgeRequest
    };

    ctx.addNote?.(
      `OnRampSquidRouterBrlToEvmEngine: output=${ctx.moonbeamToEvm.outputAmountDecimal.toFixed()} ${req.outputCurrency} on ${toNetwork}`
    );
  }
}
