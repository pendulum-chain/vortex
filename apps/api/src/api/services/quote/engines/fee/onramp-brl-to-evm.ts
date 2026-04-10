import {
  EvmNetworks,
  EvmToken,
  evmTokenConfig,
  getNetworkFromDestination,
  isNetworkEVM,
  multiplyByPowerOfTen,
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

  constructor(
    private readonly fromNetwork: Networks,
    private readonly fromToken: EvmToken
  ) {
    super();
    if (!isNetworkEVM(fromNetwork)) {
      throw new Error(`OnRampAveniaToEvmFeeEngine: ${fromNetwork} is not an EVM network`);
    }
  }

  protected validate(ctx: QuoteContext): void {
    if (!ctx.aveniaMint) {
      throw new Error("OnRampAveniaToEvmFeeEngine requires aveniaMint in context");
    }
    if (!ctx.aveniaTransfer) {
      throw new Error("OnRampAveniaToEvmFeeEngine requires aveniaTransfer in context");
    }
  }

  protected async compute(ctx: QuoteContext, anchorFee: string, feeCurrency: RampCurrency): Promise<FeeComputation> {
    const { request } = ctx;

    // biome-ignore lint/style/noNonNullAssertion: Context is validated in `validate`
    const computedAnchorFee = ctx.aveniaMint!.fee.plus(ctx.aveniaTransfer!.fee).toString();
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in `validate`
    const anchorFeeCurrency = ctx.aveniaMint!.currency as RampCurrency;

    const toNetwork = getNetworkFromDestination(request.to);
    if (!toNetwork) {
      throw new Error(`OnRampAveniaToEvmFeeEngine: invalid network for destination: ${request.to}`);
    }

    const toToken = getTokenDetailsForEvmDestination(request.outputCurrency as OnChainToken, toNetwork).erc20AddressSourceChain;

    const swapNetwork = this.fromNetwork as EvmNetworks;
    // Get token details from evmTokenConfig
    const fromTokenDetails = evmTokenConfig[swapNetwork]?.[this.fromToken];
    if (!fromTokenDetails) {
      throw new Error(`OnRampAveniaToEvmFeeEngine: invalid token configuration for ${this.fromToken} on ${swapNetwork}`);
    }

    // For simplicity, we just use the input amount and convert it to the raw amount here
    // It's not the actual amount that will be bridged but it doesn't matter for the network fee calculation
    const amountRaw = multiplyByPowerOfTen(request.inputAmount, fromTokenDetails.decimals).toFixed(0, 0);

    const bridgeResult = await calculateEvmBridgeAndNetworkFee({
      amountRaw,
      fromNetwork: swapNetwork,
      fromToken: fromTokenDetails.erc20AddressSourceChain,
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
