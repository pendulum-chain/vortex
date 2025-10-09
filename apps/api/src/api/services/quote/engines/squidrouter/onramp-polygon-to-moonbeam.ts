import { AXL_USDC_MOONBEAM, ERC20_EURE_POLYGON, ERC20_EURE_POLYGON_DECIMALS, Networks, RampDirection } from "@packages/shared";
import { QuoteContext } from "../../core/types";
import { BaseSquidRouterEngine, SquidRouterComputation, SquidRouterConfig } from "./index";

export class OnRampSquidRouterEurToAssetHubEngine extends BaseSquidRouterEngine {
  readonly config: SquidRouterConfig = {
    direction: RampDirection.BUY,
    skipNote: "OnRampSquidRouterEurToAssetHubEngine: Skipped because rampType is SELL, this engine handles BUY operations only"
  };

  protected validate(ctx: QuoteContext): void {
    if (ctx.request.to !== "assethub") {
      throw new Error(
        "OnRampSquidRouterEurToAssetHubEngine: Skipped because destination is not assethub, this engine handles assethub destinations only"
      );
    }

    if (!ctx.moneriumMint) {
      throw new Error(
        "OnRampSquidRouterEurToAssetHubEngine: Missing moneriumMint in context - ensure initialize stage ran successfully"
      );
    }
  }

  protected compute(ctx: QuoteContext): SquidRouterComputation {
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
        toNetwork: Networks.Moonbeam,
        toToken: AXL_USDC_MOONBEAM
      },
      type: "evm-to-moonbeam"
    };
  }
}
