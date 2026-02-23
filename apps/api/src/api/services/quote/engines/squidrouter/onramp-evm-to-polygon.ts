import {
  ERC20_USDC_POLYGON,
  ERC20_USDC_POLYGON_DECIMALS,
  getNetworkFromDestination,
  Networks,
  OnChainToken,
  RampDirection
} from "@vortexfi/shared";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { getTokenDetailsForEvmDestination } from "../../core/squidrouter";
import { QuoteContext } from "../../core/types";
import { BaseSquidRouterEngine, SquidRouterComputation, SquidRouterConfig } from "./index";

export class OnRampSquidRouterEvmToPolygonEngine extends BaseSquidRouterEngine {
  readonly config: SquidRouterConfig = {
    direction: RampDirection.SELL,
    skipNote: "OnRampSquidRouterEvmToPolygonEngine: Skipped because rampType is BUY, this engine handles SELL operations only"
  };

  protected validate(ctx: QuoteContext): void {
    if (ctx.request.to === "assethub") {
      throw new Error(
        "OnRampSquidRouterEvmToPolygonEngine: Skipped because destination is assethub, this engine handles EVM destinations only"
      );
    }

    if (!ctx.alfredpayOfframp?.outputAmountDecimal) {
      throw new Error(
        "OnRampSquidRouterEvmToPolygonEngine: Missing alfredpayOfframp.amountOut in context - ensure initialize stage ran successfully"
      );
    }
  }

  protected compute(ctx: QuoteContext): SquidRouterComputation {
    const req = ctx.request;
    const fromNetwork = getNetworkFromDestination(req.from);
    if (!fromNetwork) {
      throw new APIError({
        message: `Invalid source network : ${req.from} `,
        status: httpStatus.BAD_REQUEST
      });
    }

    const fromToken = getTokenDetailsForEvmDestination(req.inputCurrency as OnChainToken, req.from).erc20AddressSourceChain;
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const alfredpayOfframp = ctx.alfredpayOfframp!;

    return {
      data: {
        amountRaw: alfredpayOfframp.outputAmountRaw,
        fromNetwork: fromNetwork,
        fromToken: fromToken,
        inputAmountDecimal: alfredpayOfframp.outputAmountDecimal,
        inputAmountRaw: alfredpayOfframp.outputAmountRaw,
        outputDecimals: ERC20_USDC_POLYGON_DECIMALS,
        toNetwork: Networks.Polygon,
        toToken: ERC20_USDC_POLYGON
      },
      type: "evm-to-evm"
    };
  }
}
