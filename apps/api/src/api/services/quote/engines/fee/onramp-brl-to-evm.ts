import {
  AXL_USDC_MOONBEAM,
  getNetworkFromDestination,
  Networks,
  OnChainToken,
  RampCurrency,
  RampDirection
} from "@vortexfi/shared";
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

    const bridgeResult = await calculateEvmBridgeAndNetworkFee({
      amountRaw: request.inputAmount,
      fromNetwork: Networks.Moonbeam,
      fromToken: AXL_USDC_MOONBEAM,
      originalInputAmountForRateCalc: request.inputAmount,
      rampType: request.rampType,
      toNetwork,
      toToken
    });

    return {
      anchor: { amount: computedAnchorFee, currency: anchorFeeCurrency },
      network: { amount: bridgeResult.networkFeeUSD, currency: "USD" as RampCurrency }
    };
  }
}
