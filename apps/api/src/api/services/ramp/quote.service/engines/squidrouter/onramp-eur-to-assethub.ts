import {
  AXL_USDC_MOONBEAM,
  ERC20_EURE_POLYGON,
  ERC20_EURE_POLYGON_DECIMALS,
  EvmToken,
  Networks,
  RampDirection
} from "@packages/shared";
import Big from "big.js";
import { multiplyByPowerOfTen } from "../../../../pendulum/helpers";
import { priceFeedService } from "../../../../priceFeed.service";
import { calculateEvmBridgeAndNetworkFee, EvmBridgeRequest } from "../../core/gross-output";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampSquidRouterEurToAssetHubEngine implements Stage {
  readonly key = StageKey.OnRampSquidRouter;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY || req.to !== "assethub") {
      ctx.addNote?.("OnRampSquidRouterToAssetHubEngine: skipped");
      return;
    }

    if (!ctx.preNabla.inputAmountForSwap) {
      throw new Error("OnRampSquidRouterToAssetHubEngine requires preNabla.inputAmountForSwap");
    }

    if (!ctx.fees?.usd || !ctx.fees?.displayFiat) {
      throw new Error("OnRampSquidRouterToAssetHubEngine requires fees (usd + displayFiat) in context");
    }

    // The amount available for the squidrouter transfer from Polygon to Moonbeam
    const bridgeAmount = ctx.preNabla.inputAmountForSwap.toFixed(2, 0);
    const bridgeAmountRaw = multiplyByPowerOfTen(bridgeAmount, ERC20_EURE_POLYGON_DECIMALS).toFixed(0, 0);

    const bridgeRequest: EvmBridgeRequest = {
      fromNetwork: Networks.Polygon,
      fromToken: ERC20_EURE_POLYGON,
      intermediateAmountRaw: bridgeAmountRaw,
      originalInputAmountForRateCalc: bridgeAmountRaw,
      rampType: req.rampType,
      toNetwork: Networks.Moonbeam,
      toToken: AXL_USDC_MOONBEAM
    };

    const preliminary = await calculateEvmBridgeAndNetworkFee(bridgeRequest);
    const squidRouterNetworkFeeUSD = preliminary.networkFeeUSD;

    const vortexFeeUsd = new Big(ctx.fees.usd.vortex);
    const partnerMarkupFeeUsd = new Big(ctx.fees.usd.partnerMarkup);
    const outputAmountMoonbeamDecimal = new Big(bridgeAmount)
      .minus(vortexFeeUsd)
      .minus(partnerMarkupFeeUsd)
      .minus(squidRouterNetworkFeeUSD);

    const outputAmountMoonbeamRaw = multiplyByPowerOfTen(outputAmountMoonbeamDecimal, ERC20_EURE_POLYGON_DECIMALS).toString();

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
      `OnRampSquidRouterToAssetHubEngine: networkFeeUSD=${squidRouterNetworkFeeUSD}, finalGross=${finalGrossOutputAmountDecimal.toString()}`
    );
  }
}
