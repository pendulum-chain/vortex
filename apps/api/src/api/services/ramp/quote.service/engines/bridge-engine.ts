import { EvmToken, getNetworkFromDestination, Networks } from "@packages/shared";
import Big from "big.js";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { priceFeedService } from "../../../priceFeed.service";
import { calculateEvmBridgeAndNetworkFee, EvmBridgeRequest } from "../gross-output";
import { QuoteContext, Stage, StageKey } from "../types";

/**
 * BridgeEngine
 * - Handles EVM bridging/swapping via Squidrouter for on-ramp to EVM destinations.
 * - Calculates network fee (USD), adjusts intermediate amount by deducting fees, and recomputes final gross output.
 * - Updates ctx.bridge and augments ctx.fees (usd + displayFiat) with network fee and new totals.
 */
export class BridgeEngine implements Stage {
  readonly key = StageKey.Bridge;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    // Only applicable for on-ramp to EVM (non-AssetHub)
    if (!(ctx.isOnRamp && req.to !== "assethub")) {
      ctx.addNote?.("BridgeEngine: skipped");
      return;
    }

    if (!ctx.nabla?.outputAmountDecimal || !ctx.nabla?.outputAmountRaw) {
      throw new Error("BridgeEngine requires Nabla output in context");
    }
    if (!ctx.fees?.usd || !ctx.fees?.displayFiat) {
      throw new Error("BridgeEngine requires fees (usd + displayFiat) in context");
    }

    const toNetwork = getNetworkFromDestination(req.to);
    if (!toNetwork) {
      throw new Error(`BridgeEngine: invalid network for destination: ${req.to}`);
    }

    // Build initial bridge request: start with raw output from Nabla
    const bridgeRequest: EvmBridgeRequest = {
      fromNetwork: Networks.Polygon,
      inputCurrency: req.inputCurrency,
      intermediateAmountRaw: ctx.nabla.outputAmountRaw,
      originalInputAmountForRateCalc: ctx.preNabla?.inputAmountForSwap?.toString() ?? String(req.inputAmount),
      outputCurrency: req.outputCurrency,
      rampType: req.rampType,
      toNetwork
    };

    // First pass to estimate network fee
    const preliminary = await calculateEvmBridgeAndNetworkFee(bridgeRequest);
    const squidRouterNetworkFeeUSD = preliminary.networkFeeUSD;

    // Deduct post-Nabla fees before the EVM bridge:
    // - vortex + partner fees in USD
    // - Squidrouter network fee in USD
    const vortexFeeUsd = new Big(ctx.fees.usd.vortex);
    const partnerMarkupFeeUsd = new Big(ctx.fees.usd.partnerMarkup);
    const outputAmountMoonbeamDecimal = new Big(ctx.nabla.outputAmountDecimal)
      .minus(vortexFeeUsd)
      .minus(partnerMarkupFeeUsd)
      .minus(squidRouterNetworkFeeUSD);

    // axlUSDC on Moonbeam has 6 decimals
    const outputAmountMoonbeamRaw = multiplyByPowerOfTen(outputAmountMoonbeamDecimal, 6).toString();

    // Second pass with adjusted intermediate amount
    bridgeRequest.intermediateAmountRaw = outputAmountMoonbeamRaw;
    const final = await calculateEvmBridgeAndNetworkFee(bridgeRequest);
    const finalGrossOutputAmountDecimal = new Big(final.finalGrossOutputAmountDecimal);

    // Update context for finalize stage
    ctx.bridge = {
      finalEffectiveExchangeRate: final.finalEffectiveExchangeRate,
      finalGrossOutputAmountDecimal,
      networkFeeUSD: squidRouterNetworkFeeUSD,
      outputAmountMoonbeamRaw
    };

    // Update fees: add network fee in USD baseline, and convert to display fiat
    const displayCurrency = ctx.targetFeeFiatCurrency;
    const networkFeeDisplay = await priceFeedService.convertCurrency(squidRouterNetworkFeeUSD, EvmToken.USDC, displayCurrency);

    // Update USD totals
    const usd = ctx.fees.usd;
    const usdTotal = new Big(usd.total).plus(squidRouterNetworkFeeUSD).toFixed(6);
    ctx.fees.usd = {
      ...usd,
      network: squidRouterNetworkFeeUSD,
      total: usdTotal
    };

    // Update display fiat totals
    const display = ctx.fees.displayFiat;
    const newDisplayTotal = new Big(display.vortex)
      .plus(display.anchor)
      .plus(display.partnerMarkup)
      .plus(networkFeeDisplay)
      .toFixed(2);

    ctx.fees.displayFiat = {
      ...display,
      network: networkFeeDisplay,
      total: newDisplayTotal
    };

    ctx.addNote?.(
      `BridgeEngine: networkFeeUSD=${squidRouterNetworkFeeUSD}, finalGross=${finalGrossOutputAmountDecimal.toString()}`
    );
  }
}
