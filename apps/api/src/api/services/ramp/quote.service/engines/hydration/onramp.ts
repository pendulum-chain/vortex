import {
  AssetHubToken,
  assetHubTokenConfig,
  EvmToken,
  getOnChainTokenDetails,
  multiplyByPowerOfTen,
  Networks,
  OnChainToken,
  RampCurrency,
  RampDirection
} from "@packages/shared";
import { getBestSellPriceFor } from "../../../../hydration/swap";
import { calculateNablaSwapOutput } from "../../core/gross-output";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampHydrationEngine implements Stage {
  readonly key = StageKey.OnRampHydration;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("OnRampHydrationEngine: skipped for off-ramp request");
      return;
    }

    if (!ctx.nabla?.outputAmountDecimal) {
      throw new Error("OnRampHydrationEngine requires nabla.outputAmountDecimal in context");
    }

    // We will always use Assethub USDC as the input token of the swap
    const inputTokenDetails = assetHubTokenConfig[AssetHubToken.USDC];
    const outputTokenDetails = assetHubTokenConfig[req.outputCurrency as AssetHubToken];

    const assetIn = inputTokenDetails.hydrationId;
    const assetOut = outputTokenDetails.hydrationId;
    const amountIn = ctx.nabla.outputAmountDecimal.toFixed(inputTokenDetails.decimals);

    const trade = await getBestSellPriceFor(assetIn, assetOut, amountIn);

    const amountOut = trade.amountOut.toString();

    ctx.hydration = {
      amountInRaw: trade.amountIn.toString(),
      amountOutRaw: trade.amountOut.toString(),
      assetIn: assetIn,
      assetOut: assetOut
    };

    ctx.addNote?.(
      `OnRampHydrationEngine: swap ${amountIn} ${inputTokenDetails.assetSymbol} to ${amountOut} ${outputTokenDetails.assetSymbol}`
    );
  }
}
