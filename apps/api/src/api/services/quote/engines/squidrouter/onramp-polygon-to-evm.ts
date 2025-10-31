import {
  ERC20_EURE_POLYGON,
  ERC20_EURE_POLYGON_DECIMALS,
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

export class OnRampSquidRouterEurToEvmEngine extends BaseSquidRouterEngine {
  readonly config: SquidRouterConfig = {
    direction: RampDirection.BUY,
    skipNote: "OnRampSquidRouterEurToEvmEngine: Skipped because rampType is SELL, this engine handles BUY operations only"
  };

  protected validate(ctx: QuoteContext): void {
    if (ctx.request.to === "assethub") {
      throw new Error(
        "OnRampSquidRouterEurToEvmEngine: Skipped because destination is assethub, this engine handles EVM destinations only"
      );
    }

    if (!ctx.moneriumMint?.outputAmountDecimal) {
      throw new Error(
        "OnRampSquidRouterEurToEvmEngine: Missing moneriumMint.amountOut in context - ensure initialize stage ran successfully"
      );
    }
  }

  protected compute(ctx: QuoteContext): SquidRouterComputation {
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
    const moneriumMint = ctx.moneriumMint!;

    return {
      data: {
        amountRaw: moneriumMint.outputAmountRaw,
        fromNetwork: Networks.Polygon,
        fromToken: ERC20_EURE_POLYGON,
        inputAmountDecimal: moneriumMint.outputAmountDecimal,
        inputAmountRaw: moneriumMint.outputAmountRaw,
        outputDecimals: ERC20_EURE_POLYGON_DECIMALS,
        toNetwork,
        toToken
      },
      type: "evm-to-evm"
    };
  }
}
