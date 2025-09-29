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

    if (!ctx.preNabla?.deductibleFeeAmount) {
      throw new Error("OnRampSquidRouterToAssetHubEngine requires pre-Nabla deductible fee in context");
    }

    if (!ctx.fees?.displayFiat || !ctx.fees?.usd) {
      throw new Error("OnRampSquidRouterToAssetHubEngine requires fees in context");
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

    ctx.bridge = {
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

    const displayCurrency = ctx.targetFeeFiatCurrency;
    const networkFeeDisplay = await priceFeedService.convertCurrency(squidRouterNetworkFeeUSD, EvmToken.USDC, displayCurrency);

    // Adjust the total fees to include the squidrouter network fee
    const totalDisplayFiat = new Big(ctx.fees.displayFiat.total).plus(networkFeeDisplay).toFixed(6);
    const totalUsd = new Big(ctx.fees.usd.total).plus(squidRouterNetworkFeeUSD).toFixed(6);

    ctx.fees = {
      displayFiat: {
        ...ctx.fees.displayFiat,
        network: networkFeeDisplay,
        total: totalDisplayFiat
      },
      usd: {
        ...ctx.fees.usd,
        network: squidRouterNetworkFeeUSD,
        total: totalUsd
      }
    };

    // Set the preNabla input to the output amount of the bridge minus all preNabla fees
    // For this flow, the Nabla input currency is a USD stablecoin so we don't need to convert prices
    // biome-ignore lint/style/noNonNullAssertion: Justification: We check ctx.fees.usd above
    const usdFees = ctx.fees.usd!;
    ctx.preNabla.inputAmountForSwap = ctx.bridge.outputAmountDecimal
      .minus(usdFees.vortex)
      .minus(usdFees.partnerMarkup)
      .minus(usdFees.network);

    ctx.addNote?.(
      `OnRampSquidRouterToAssetHubEngine: networkFeeUSD=${squidRouterNetworkFeeUSD}, finalGross=${bridgeResult.finalGrossOutputAmountDecimal.toString()}, inputForNablaSwap=${ctx.preNabla.inputAmountForSwap.toString()}`
    );
  }
}
