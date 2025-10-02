import {
  AXL_USDC_MOONBEAM,
  EvmToken,
  evmTokenConfig,
  getNetworkFromDestination,
  Networks,
  OnChainToken,
  RampDirection
} from "@packages/shared";
import Big from "big.js";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { priceFeedService } from "../../../priceFeed.service";
import { calculateEvmBridgeAndNetworkFee, EvmBridgeRequest, getTokenDetailsForEvmDestination } from "../../core/squidrouter";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampSquidRouterBrlToEvmEngine implements Stage {
  readonly key = StageKey.OnRampSquidRouter;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY || req.to === "assethub") {
      ctx.addNote?.("OnRampBridgeEngine: skipped");
      return;
    }

    if (!ctx.nablaSwap?.outputAmountDecimal || !ctx.nablaSwap?.outputAmountRaw) {
      throw new Error("OnRampBridgeEngine requires Nabla output in context");
    }
    if (!ctx.fees?.usd || !ctx.fees?.displayFiat) {
      throw new Error("OnRampBridgeEngine requires fees (usd + displayFiat) in context");
    }

    const toNetwork = getNetworkFromDestination(req.to);
    if (!toNetwork) {
      throw new Error(`OnRampBridgeEngine: invalid network for destination: ${req.to}`);
    }

    const toToken = getTokenDetailsForEvmDestination(req.outputCurrency as OnChainToken, toNetwork).erc20AddressSourceChain;

    const bridgeRequest: EvmBridgeRequest = {
      amountRaw: ctx.nablaSwap.outputAmountRaw,
      fromNetwork: Networks.Moonbeam,
      fromToken: AXL_USDC_MOONBEAM,
      originalInputAmountForRateCalc: ctx.preNabla?.inputAmountForSwap?.toString() ?? String(req.inputAmount),
      rampType: req.rampType,
      toNetwork,
      toToken
    };

    const preliminary = await calculateEvmBridgeAndNetworkFee(bridgeRequest);
    const squidRouterNetworkFeeUSD = preliminary.networkFeeUSD;

    const vortexFeeUsd = new Big(ctx.fees.usd.vortex);
    const partnerMarkupFeeUsd = new Big(ctx.fees.usd.partnerMarkup);
    const outputAmountMoonbeamDecimal = new Big(ctx.nablaSwap.outputAmountDecimal)
      .minus(vortexFeeUsd)
      .minus(partnerMarkupFeeUsd)
      .minus(squidRouterNetworkFeeUSD);

    const outputAmountMoonbeamRaw = multiplyByPowerOfTen(outputAmountMoonbeamDecimal, 6).toString();

    bridgeRequest.amountRaw = outputAmountMoonbeamRaw;
    const final = await calculateEvmBridgeAndNetworkFee(bridgeRequest);
    const finalGrossOutputAmountDecimal = new Big(final.finalGrossOutputAmountDecimal);

    // TODO adjust these parameters
    ctx.moonbeamToEvm = {
      effectiveExchangeRate: final.finalEffectiveExchangeRate,
      networkFeeUSD: squidRouterNetworkFeeUSD,
      outputAmountDecimal: finalGrossOutputAmountDecimal
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
