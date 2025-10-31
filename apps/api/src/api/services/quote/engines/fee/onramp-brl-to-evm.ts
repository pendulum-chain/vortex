import {
  AXL_USDC_MOONBEAM,
  AXL_USDC_MOONBEAM_DETAILS,
  getNetworkFromDestination,
  multiplyByPowerOfTen,
  Networks,
  OnChainToken,
  RampCurrency,
  RampDirection
} from "@packages/shared";
import { calculateEvmBridgeAndNetworkFee, getTokenDetailsForEvmDestination } from "../../core/squidrouter";
import { QuoteContext } from "../../core/types";
import { BaseFeeEngine, FeeComputation, FeeConfig } from "./index";

export class OnRampAveniaToEvmFeeEngine extends BaseFeeEngine {
  readonly config: FeeConfig = {
    direction: RampDirection.BUY,
    skipNote: "Skipped for off-ramp request"
  };

  protected validate(ctx: QuoteContext): void {
    if (!ctx.aveniaMint) {
      throw new Error("OnRampFeeAveniaToEvmEngine requires aveniaMint in context");
    }
  }

  protected async compute(ctx: QuoteContext, anchorFee: string, feeCurrency: RampCurrency): Promise<FeeComputation> {
    const { request } = ctx;

    // biome-ignore lint/style/noNonNullAssertion: Context is validated in `validate`
    const computedAnchorFee = ctx.aveniaMint!.fee.toString();
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in `validate`
    const anchorFeeCurrency = ctx.aveniaMint!.currency as RampCurrency;

    const toNetwork = getNetworkFromDestination(request.to);
    if (!toNetwork) {
      throw new Error(`OnRampFeeAveniaToEvmEngine: invalid network for destination: ${request.to}`);
    }

    const toToken = getTokenDetailsForEvmDestination(request.outputCurrency as OnChainToken, toNetwork).erc20AddressSourceChain;

    // For simplicity, we just use the input amount and convert it to the raw amount here
    // It's not the actual amount that will be bridged but it doesn't matter for the network fee calculation
    const amountRaw = multiplyByPowerOfTen(request.inputAmount, AXL_USDC_MOONBEAM_DETAILS.decimals).toFixed(0, 0);

    const bridgeResult = await calculateEvmBridgeAndNetworkFee({
      amountRaw,
      fromNetwork: Networks.Moonbeam,
      fromToken: AXL_USDC_MOONBEAM,
      originalInputAmountForRateCalc: request.inputAmount,
      rampType: request.rampType,
      toNetwork,
      toToken
    });
    console.log("OnRampAveniaToEvmFeeEngine: bridge and network fee result", bridgeResult);

    return {
      anchor: { amount: computedAnchorFee, currency: anchorFeeCurrency },
      network: { amount: bridgeResult.networkFeeUSD, currency: "USD" as RampCurrency }
    };
  }
}
