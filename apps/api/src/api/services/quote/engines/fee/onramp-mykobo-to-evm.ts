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

export class OnRampMykoboToEvmFeeEngine extends BaseFeeEngine {
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
      throw new Error(`OnRampMykoboToEvmFeeEngine: ${fromNetwork} is not an EVM network`);
    }
  }

  protected validate(ctx: QuoteContext): void {
    if (!ctx.mykoboMint) {
      throw new Error("OnRampMykoboToEvmFeeEngine requires mykoboMint in context");
    }
  }

  protected async compute(ctx: QuoteContext, _anchorFee: string, _feeCurrency: RampCurrency): Promise<FeeComputation> {
    const { request } = ctx;

    // biome-ignore lint/style/noNonNullAssertion: Context is validated in `validate`
    const computedAnchorFee = ctx.mykoboMint!.fee.toString();
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in `validate`
    const anchorFeeCurrency = ctx.mykoboMint!.currency as RampCurrency;

    const toNetwork = getNetworkFromDestination(request.to);
    if (!toNetwork) {
      throw new Error(`OnRampMykoboToEvmFeeEngine: invalid network for destination: ${request.to}`);
    }

    const toToken = getTokenDetailsForEvmDestination(request.outputCurrency as OnChainToken, toNetwork).erc20AddressSourceChain;

    const swapNetwork = this.fromNetwork as EvmNetworks;
    const fromTokenDetails = evmTokenConfig[swapNetwork]?.[this.fromToken];
    if (!fromTokenDetails) {
      throw new Error(`OnRampMykoboToEvmFeeEngine: invalid token configuration for ${this.fromToken} on ${swapNetwork}`);
    }

    if (
      (swapNetwork === toNetwork && fromTokenDetails.erc20AddressSourceChain.toLowerCase() === toToken.toLowerCase()) ||
      (request.outputCurrency === EvmToken.MORPHO_VAULT && swapNetwork === toNetwork)
    ) {
      return {
        anchor: { amount: computedAnchorFee, currency: anchorFeeCurrency },
        network: { amount: "0", currency: "USD" as RampCurrency }
      };
    }

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
