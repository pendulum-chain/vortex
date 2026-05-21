import { ERC20_EURC_BASE, getNetworkFromDestination, OnChainToken, RampDirection } from "@vortexfi/shared";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { MYKOBO_BASE_NETWORK } from "../../../mykobo";
import { getTokenDetailsForEvmDestination } from "../../core/squidrouter";
import { QuoteContext } from "../../core/types";
import { BaseSquidRouterEngine, SquidRouterComputation, SquidRouterConfig } from "./index";

export class OnRampSquidRouterMykoboBaseToEvmEngine extends BaseSquidRouterEngine {
  readonly config: SquidRouterConfig = {
    direction: RampDirection.BUY,
    skipNote:
      "OnRampSquidRouterMykoboBaseToEvmEngine: Skipped because rampType is SELL, this engine handles BUY operations only"
  };

  protected validate(ctx: QuoteContext): void {
    if (ctx.request.to === "assethub") {
      throw new Error(
        "OnRampSquidRouterMykoboBaseToEvmEngine: Skipped because destination is assethub, this engine handles EVM destinations only"
      );
    }

    if (!ctx.mykoboMint?.outputAmountDecimal) {
      throw new Error(
        "OnRampSquidRouterMykoboBaseToEvmEngine: Missing mykoboMint.outputAmountDecimal in context - ensure initialize stage ran successfully"
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

    const toToken = getTokenDetailsForEvmDestination(req.outputCurrency as OnChainToken, req.to);
    const toTokenAddress = toToken.erc20AddressSourceChain;
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in validate
    const mykoboMint = ctx.mykoboMint!;

    const isSameTokenSameChain =
      toNetwork === MYKOBO_BASE_NETWORK && toTokenAddress.toLowerCase() === ERC20_EURC_BASE.toLowerCase();

    return {
      data: {
        amountRaw: mykoboMint.outputAmountRaw,
        fromNetwork: MYKOBO_BASE_NETWORK,
        fromToken: ERC20_EURC_BASE,
        inputAmountDecimal: mykoboMint.outputAmountDecimal,
        inputAmountRaw: mykoboMint.outputAmountRaw,
        outputDecimals: toToken.decimals,
        skipRouteCalculation: isSameTokenSameChain,
        toNetwork,
        toToken: toTokenAddress
      },
      type: "evm-to-evm"
    };
  }
}
