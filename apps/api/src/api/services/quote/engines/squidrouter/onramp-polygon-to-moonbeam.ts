import { AXL_USDC_MOONBEAM, ERC20_EURE_POLYGON, ERC20_EURE_POLYGON_DECIMALS, Networks, RampDirection } from "@packages/shared";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { calculateEvmBridgeAndNetworkFee, EvmBridgeRequest } from "../../core/squidrouter";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampSquidRouterEurToAssetHubEngine implements Stage {
  readonly key = StageKey.SquidRouter;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY || req.to !== "assethub") {
      ctx.addNote?.("OnRampSquidRouterToAssetHubEngine: skipped");
      return;
    }

    if (!ctx.moneriumMint) {
      throw new Error("OnRampSquidRouterToAssetHubEngine requires Monerium mint output in context");
    }

    const fromToken = ERC20_EURE_POLYGON;
    const fromNetwork = Networks.Polygon;
    const toToken = AXL_USDC_MOONBEAM;
    const toNetwork = Networks.Moonbeam;

    const bridgeRequest: EvmBridgeRequest = {
      amountRaw: ctx.moneriumMint.amountOutRaw,
      fromNetwork,
      fromToken,
      originalInputAmountForRateCalc: ctx.moneriumMint.amountOutRaw,
      rampType: req.rampType,
      toNetwork,
      toToken
    };

    const bridgeResult = await calculateEvmBridgeAndNetworkFee(bridgeRequest);
    const squidRouterNetworkFeeUSD = bridgeResult.networkFeeUSD;

    const outputAmountMoonbeamRaw = multiplyByPowerOfTen(
      bridgeResult.finalGrossOutputAmountDecimal,
      ERC20_EURE_POLYGON_DECIMALS
    ).toString();

    ctx.evmToMoonbeam = {
      effectiveExchangeRate: bridgeResult.finalEffectiveExchangeRate,
      fromNetwork,
      fromToken,
      inputAmountDecimal: ctx.moneriumMint.amountOut,
      inputAmountRaw: ctx.moneriumMint.amountOutRaw,
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
