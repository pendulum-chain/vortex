import { AXL_USDC_MOONBEAM, getNetworkFromDestination, Networks, OnChainToken, RampDirection } from "@packages/shared";
import Big from "big.js";
import { getTokenDetailsForEvmDestination } from "../../core/squidrouter";
import { QuoteContext } from "../../core/types";
import { BaseSquidRouterEngine, SquidRouterComputation, SquidRouterConfig } from "./index";

export class OnRampSquidRouterBrlToEvmEngine extends BaseSquidRouterEngine {
  readonly config: SquidRouterConfig = {
    direction: RampDirection.BUY,
    skipNote: "OnRampSquidRouterBrlToEvmEngine: Skipped because rampType is SELL, this engine handles BUY operations only"
  };

  protected validate(ctx: QuoteContext): void {
    if (ctx.request.to === "assethub") {
      throw new Error(
        "OnRampSquidRouterBrlToEvmEngine: Skipped because destination is assethub, this engine handles EVM destinations only"
      );
    }

    if (!ctx.pendulumToMoonbeamXcm) {
      throw new Error(
        "OnRampSquidRouterBrlToEvmEngine: Missing pendulumToMoonbeamXcm in context - ensure pendulum-transfers stage ran successfully"
      );
    }
  }

  protected compute(ctx: QuoteContext): SquidRouterComputation {
    const req = ctx.request;
    const toNetwork = getNetworkFromDestination(req.to);
    if (!toNetwork) {
      throw new Error(
        `OnRampSquidRouterBrlToEvmEngine: Invalid network for destination: ${req.to} - ensure destination is a valid EVM network`
      );
    }

    const toToken = getTokenDetailsForEvmDestination(req.outputCurrency as OnChainToken, toNetwork).erc20AddressSourceChain;
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const pendulumToMoonbeamXcm = ctx.pendulumToMoonbeamXcm!;

    return {
      data: {
        amountRaw: pendulumToMoonbeamXcm.outputAmountRaw,
        fromNetwork: Networks.Moonbeam,
        fromToken: AXL_USDC_MOONBEAM,
        inputAmountDecimal: pendulumToMoonbeamXcm.outputAmountDecimal,
        inputAmountRaw: pendulumToMoonbeamXcm.outputAmountRaw,
        outputDecimals: getTokenDetailsForEvmDestination(req.outputCurrency as OnChainToken, toNetwork).decimals,
        toNetwork,
        toToken
      },
      type: "moonbeam-to-evm"
    };
  }
}
