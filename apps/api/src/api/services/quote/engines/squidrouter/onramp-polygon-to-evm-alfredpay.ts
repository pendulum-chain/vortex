import {
  ALFREDPAY_ERC20_TOKEN,
  ALFREDPAY_EVM_TOKEN,
  getNetworkFromDestination,
  Networks,
  OnChainToken,
  RampDirection
} from "@vortexfi/shared";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { getTokenDetailsForEvmDestination } from "../../core/squidrouter";
import { QuoteContext } from "../../core/types";
import { BaseSquidRouterEngine, SquidRouterComputation, SquidRouterConfig, SquidRouterData } from "./index";

export class OnRampSquidRouterUsdToEvmEngine extends BaseSquidRouterEngine {
  readonly config: SquidRouterConfig = {
    direction: RampDirection.BUY,
    skipNote: "OnRampSquidRouterUsdToEvmEngine: Skipped because rampType is SELL, this engine handles BUY operations only"
  };

  protected validate(ctx: QuoteContext): void {
    if (ctx.request.to === "assethub") {
      throw new Error(
        "OnRampSquidRouterUsdToEvmEngine: Skipped because destination is assethub, this engine handles EVM destinations only"
      );
    }

    if (!ctx.alfredpayMint?.outputAmountDecimal) {
      throw new Error(
        "OnRampSquidRouterUsdToEvmEngine: Missing alfredpayMint.amountOut in context - ensure initialize stage ran successfully"
      );
    }

    if (!ctx.subsidy) {
      throw new Error("OnRampSquidRouterUsdToEvmEngine: Missing subsidy in context - ensure discount stage ran successfully");
    }
  }

  protected compute(ctx: QuoteContext): SquidRouterComputation {
    if (ctx.to === Networks.Polygon && ctx.request.outputCurrency === ALFREDPAY_EVM_TOKEN) {
      // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
      const subsidy = ctx.subsidy!;
      return {
        data: {
          amountRaw: subsidy.actualOutputAmountRaw,
          fromNetwork: Networks.Polygon,
          fromToken: ALFREDPAY_ERC20_TOKEN,
          inputAmountDecimal: subsidy.actualOutputAmountDecimal,
          inputAmountRaw: subsidy.actualOutputAmountRaw,
          outputDecimals: 6,
          skipRouteCalculation: true,
          toNetwork: Networks.Polygon,
          toToken: ALFREDPAY_EVM_TOKEN
        } as unknown as SquidRouterData,
        type: "evm-to-evm"
      };
    }

    const req = ctx.request;
    const toNetwork = getNetworkFromDestination(req.to);
    if (!toNetwork) {
      throw new APIError({
        message: `Invalid network for destination: ${req.to} `,
        status: httpStatus.BAD_REQUEST
      });
    }

    const toTokenDetails = getTokenDetailsForEvmDestination(req.outputCurrency as OnChainToken, req.to);
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const subsidy = ctx.subsidy!;
    console.log("Inputs for evm-to-evm computation", {
      amountRaw: subsidy.targetOutputAmountRaw,
      fromNetwork: Networks.Polygon,
      fromToken: ALFREDPAY_ERC20_TOKEN,
      inputAmountDecimal: subsidy.targetOutputAmountDecimal.toString(),
      inputAmountRaw: subsidy.targetOutputAmountRaw,
      outputDecimals: toTokenDetails.decimals
    });

    return {
      data: {
        amountRaw: subsidy.targetOutputAmountRaw,
        fromNetwork: Networks.Polygon,
        fromToken: ALFREDPAY_ERC20_TOKEN,
        inputAmountDecimal: subsidy.targetOutputAmountDecimal,
        inputAmountRaw: subsidy.targetOutputAmountRaw,
        outputDecimals: toTokenDetails.decimals,
        toNetwork,
        toToken: toTokenDetails.erc20AddressSourceChain
      },
      type: "evm-to-evm"
    };
  }
}
