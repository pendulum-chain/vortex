import {
  ALFREDPAY_ERC20_DECIMALS,
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
  }

  protected compute(ctx: QuoteContext): SquidRouterComputation {
    if (ctx.to === Networks.Polygon && ctx.request.outputCurrency === ALFREDPAY_EVM_TOKEN) {
      return {
        data: {
          skipRouteCalculation: true
        } as SquidRouterData,
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

    const toToken = getTokenDetailsForEvmDestination(req.outputCurrency as OnChainToken, req.to).erc20AddressSourceChain;
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const alfredpayMint = ctx.alfredpayMint!;

    return {
      data: {
        amountRaw: alfredpayMint.outputAmountRaw,
        fromNetwork: Networks.Polygon,
        fromToken: ALFREDPAY_ERC20_TOKEN,
        inputAmountDecimal: alfredpayMint.outputAmountDecimal,
        inputAmountRaw: alfredpayMint.outputAmountRaw,
        outputDecimals: ALFREDPAY_ERC20_DECIMALS,
        toNetwork,
        toToken
      },
      type: "evm-to-evm"
    };
  }
}
