import {
  AXL_USDC_MOONBEAM,
  ERC20_EURE_POLYGON,
  ERC20_EURE_POLYGON_DECIMALS,
  EvmToken,
  Networks,
  RampDirection
} from "@packages/shared";
import Big from "big.js";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { priceFeedService } from "../../../priceFeed.service";
import { calculateEvmBridgeAndNetworkFee, EvmBridgeRequest } from "../../core/squidrouter";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampSquidRouterEurToAssetHubEngine implements Stage {
  readonly key = StageKey.OnRampSquidRouter;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY || req.to !== "assethub") {
      ctx.addNote?.("OnRampSquidRouterToAssetHubEngine: skipped");
      return;
    }

    if (!ctx.moneriumMint?.amountOut) {
      throw new Error("OnRampSquidRouterToAssetHubEngine requires Monerium mint output in context");
    }

    // The amount available for the squidrouter transfer from Polygon to Moonbeam
    const bridgeAmount = ctx.request.inputAmount;
    const bridgeAmountRaw = multiplyByPowerOfTen(bridgeAmount, ERC20_EURE_POLYGON_DECIMALS).toFixed(0, 0);

    const fromToken = ERC20_EURE_POLYGON;
    const fromNetwork = Networks.Polygon;
    const toToken = AXL_USDC_MOONBEAM;
    const toNetwork = Networks.Moonbeam;

    const bridgeRequest: EvmBridgeRequest = {
      amountRaw: bridgeAmountRaw,
      fromNetwork,
      fromToken,
      originalInputAmountForRateCalc: bridgeAmountRaw,
      rampType: req.rampType,
      toNetwork,
      toToken
    };

    const bridgeResult = await calculateEvmBridgeAndNetworkFee(bridgeRequest);
    const squidRouterNetworkFeeUSD = bridgeResult.networkFeeUSD;

    const outputAmountMoonbeamRaw = multiplyByPowerOfTen(bridgeAmount, ERC20_EURE_POLYGON_DECIMALS).toString();

    ctx.evmToMoonbeam = {
      effectiveExchangeRate: bridgeResult.finalEffectiveExchangeRate,
      fromNetwork,
      fromToken,
      inputAmountDecimal: new Big(bridgeAmount),
      inputAmountRaw: bridgeAmountRaw,
      networkFeeUSD: squidRouterNetworkFeeUSD,
      outputAmountDecimal: bridgeResult.finalGrossOutputAmountDecimal,
      outputAmountRaw: outputAmountMoonbeamRaw,
      toNetwork,
      toToken
    };

    ctx.addNote?.(
      `OnRampSquidRouterEurToAssetHubEngine: output=${bridgeResult.finalGrossOutputAmountDecimal.toString()} ${String(toToken)}, raw=${outputAmountMoonbeamRaw}`
    );
  }
}
