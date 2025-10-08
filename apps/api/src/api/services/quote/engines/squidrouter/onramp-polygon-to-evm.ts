import {
  AXL_USDC_MOONBEAM,
  ERC20_EURE_POLYGON,
  ERC20_EURE_POLYGON_DECIMALS,
  EvmToken,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  isOnChainToken,
  Networks,
  OnChainToken,
  RampDirection
} from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { priceFeedService } from "../../../priceFeed.service";
import { calculateEvmBridgeAndNetworkFee, EvmBridgeRequest, getTokenDetailsForEvmDestination } from "../../core/squidrouter";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampSquidRouterEurToEvmEngine implements Stage {
  readonly key = StageKey.OnRampSquidRouter;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY || req.to === "assethub") {
      ctx.addNote?.("Skipped");
      return;
    }

    if (!ctx.moneriumMint?.amountOut) {
      throw new Error("OnRampSquidRouterToAssetHubEngine requires Monerium mint output in context");
    }

    const fromToken = ERC20_EURE_POLYGON;
    const fromNetwork = Networks.Polygon;
    const toNetwork = getNetworkFromDestination(req.to);
    const toToken = getTokenDetailsForEvmDestination(req.outputCurrency as OnChainToken, req.to).erc20AddressSourceChain;

    if (!toNetwork) {
      throw new APIError({
        message: `Invalid network for destination: ${req.to} `,
        status: httpStatus.BAD_REQUEST
      });
    }

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

    ctx.evmToEvm = {
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
