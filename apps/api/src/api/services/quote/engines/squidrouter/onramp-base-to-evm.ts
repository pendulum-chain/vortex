import {
  ERC20_USDC_POLYGON,
  ERC20_USDC_POLYGON_DECIMALS,
  EvmToken,
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

export class OnRampSquidRouterBrlToEvmEngineBase extends BaseSquidRouterEngine {
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

    if (!ctx.aveniaMint?.outputAmountDecimal) {
      throw new Error(
        "OnRampSquidRouterBrlToEvmEngine: Missing aveniaMint.outputAmountDecimal in context - ensure initialize stage ran successfully"
      );
    }
  }

  protected compute(ctx: QuoteContext): SquidRouterComputation {
    // skip for the trivial case scenario.
    if (ctx.to === Networks.Base && ctx.request.outputCurrency === EvmToken.USDC) {
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
    const aveniaMint = ctx.aveniaMint!;

    const usdcBaseTokenDetails = getTokenDetailsForEvmDestination(EvmToken.USDC, Networks.Base);

    return {
      data: {
        amountRaw: aveniaMint.outputAmountRaw,
        fromNetwork: Networks.Base,
        fromToken: usdcBaseTokenDetails.erc20AddressSourceChain,
        inputAmountDecimal: aveniaMint.outputAmountDecimal,
        inputAmountRaw: aveniaMint.outputAmountRaw,
        outputDecimals: usdcBaseTokenDetails.decimals,
        toNetwork,
        toToken
      },
      type: "evm-to-evm"
    };
  }
}
