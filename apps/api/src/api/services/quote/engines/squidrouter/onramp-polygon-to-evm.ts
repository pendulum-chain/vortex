import {
  ERC20_EURE_POLYGON,
  ERC20_EURE_POLYGON_DECIMALS,
  getNetworkFromDestination,
  Networks,
  OnChainToken,
  RampDirection
} from "@packages/shared";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { getTokenDetailsForEvmDestination } from "../../core/squidrouter";
import { QuoteContext } from "../../core/types";
import { BaseSquidRouterEngine, SquidRouterComputation, SquidRouterConfig } from "./index";

export class OnRampSquidRouterEurToEvmEngine extends BaseSquidRouterEngine {
  readonly config: SquidRouterConfig = {
    direction: RampDirection.BUY,
    skipNote: "Skipped"
  };

  protected validate(ctx: QuoteContext): void {
    if (ctx.request.to === "assethub") {
      throw new Error("OnRampSquidRouterEurToEvmEngine: skipped for assethub");
    }

    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const moneriumMint = ctx.moneriumMint;
    if (!moneriumMint?.amountOut) {
      throw new Error("OnRampSquidRouterToAssetHubEngine requires Monerium mint output in context");
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
        amountRaw: moneriumMint.amountOutRaw,
        fromNetwork: Networks.Polygon,
        fromToken: ERC20_EURE_POLYGON,
        inputAmountDecimal: moneriumMint.amountOut,
        inputAmountRaw: moneriumMint.amountOutRaw,
        outputDecimals: ERC20_EURE_POLYGON_DECIMALS,
        toNetwork,
        toToken
      },
      type: "evm-to-evm"
    };
  }
}
