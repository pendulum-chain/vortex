import { EvmToken, evmTokenConfig, getNetworkFromDestination, Networks, OnChainToken, RampDirection } from "@packages/shared";
import Big from "big.js";
import { multiplyByPowerOfTen } from "../../../../pendulum/helpers";
import { priceFeedService } from "../../../../priceFeed.service";
import { calculateEvmBridgeAndNetworkFee, EvmBridgeRequest } from "../../gross-output";
import { QuoteContext, Stage, StageKey } from "../../types";

export class OnRampSquidRouterToEvmEngine implements Stage {
  readonly key = StageKey.OnRampSquidRouter;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY || req.to === "assethub") {
      ctx.addNote?.("OnRampBridgeEngine: skipped");
      return;
    }

    if (!ctx.nabla?.outputAmountDecimal || !ctx.nabla?.outputAmountRaw) {
      throw new Error("OnRampBridgeEngine requires Nabla output in context");
    }
    if (!ctx.fees?.usd || !ctx.fees?.displayFiat) {
      throw new Error("OnRampBridgeEngine requires fees (usd + displayFiat) in context");
    }

    const toNetwork = getNetworkFromDestination(req.to);
    if (!toNetwork) {
      throw new Error(`OnRampBridgeEngine: invalid network for destination: ${req.to}`);
    }

    const bridgeRequest: EvmBridgeRequest = {
      fromNetwork: Networks.Moonbeam,
      inputCurrency: EvmToken.AXLUSDC,
      intermediateAmountRaw: ctx.nabla.outputAmountRaw,
      originalInputAmountForRateCalc: ctx.preNabla?.inputAmountForSwap?.toString() ?? String(req.inputAmount),
      outputCurrency: req.outputCurrency as OnChainToken,
      rampType: req.rampType,
      toNetwork
    };

    const preliminary = await calculateEvmBridgeAndNetworkFee(bridgeRequest);
    const squidRouterNetworkFeeUSD = preliminary.networkFeeUSD;

    const vortexFeeUsd = new Big(ctx.fees.usd.vortex);
    const partnerMarkupFeeUsd = new Big(ctx.fees.usd.partnerMarkup);
    const outputAmountMoonbeamDecimal = new Big(ctx.nabla.outputAmountDecimal)
      .minus(vortexFeeUsd)
      .minus(partnerMarkupFeeUsd)
      .minus(squidRouterNetworkFeeUSD);

    const outputAmountMoonbeamRaw = multiplyByPowerOfTen(outputAmountMoonbeamDecimal, 6).toString();

    bridgeRequest.intermediateAmountRaw = outputAmountMoonbeamRaw;
    const final = await calculateEvmBridgeAndNetworkFee(bridgeRequest);
    const finalGrossOutputAmountDecimal = new Big(final.finalGrossOutputAmountDecimal);

    ctx.bridge = {
      finalEffectiveExchangeRate: final.finalEffectiveExchangeRate,
      finalGrossOutputAmountDecimal,
      networkFeeUSD: squidRouterNetworkFeeUSD,
      outputAmountMoonbeamRaw
    };

    const displayCurrency = ctx.targetFeeFiatCurrency;
    const networkFeeDisplay = await priceFeedService.convertCurrency(squidRouterNetworkFeeUSD, EvmToken.USDC, displayCurrency);

    const usd = ctx.fees.usd;
    const usdTotal = new Big(usd.total).plus(squidRouterNetworkFeeUSD).toFixed(6);
    ctx.fees.usd = {
      ...usd,
      network: squidRouterNetworkFeeUSD,
      total: usdTotal
    };

    const display = ctx.fees.displayFiat;
    const newDisplayTotal = new Big(display.vortex)
      .plus(display.anchor)
      .plus(display.partnerMarkup)
      .plus(networkFeeDisplay)
      .toFixed(2);

    ctx.fees.displayFiat.network = networkFeeDisplay;
    ctx.fees.displayFiat.total = newDisplayTotal;

    ctx.addNote?.(
      `OnRampBridgeEngine: networkFeeUSD=${squidRouterNetworkFeeUSD}, finalGross=${finalGrossOutputAmountDecimal.toString()}`
    );
  }
}
