import {
  AssetHubToken,
  assetHubTokenConfig,
  createHydrationToAssethubTransfer,
  multiplyByPowerOfTen,
  RampDirection
} from "@packages/shared";
import { getBestSellPriceFor } from "../../../hydration/swap";
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

    const amountInRaw = trade.amountIn.toString();
    const amountOutRaw = trade.amountOut.toString();
    const assetOutDecimals = trade.swaps[trade.swaps.length - 1].assetOutDecimals;
    const amountOut = multiplyByPowerOfTen(amountOutRaw, -assetOutDecimals).toFixed(assetOutDecimals);

    const dummyDestination = "5DqTNJsGp6UayR5iHAZvH4zquY6ni6j35ZXLtJA6bXwsfixg";
    const { fees } = await createHydrationToAssethubTransfer(dummyDestination, amountOutRaw, assetOut);

    ctx.hydration = {
      amountIn,
      amountInRaw,
      amountOut,
      amountOutRaw,
      assetIn: assetIn,
      assetOut: assetOut,
      xcmFees: fees
    };

    ctx.addNote?.(
      `OnRampHydrationEngine: swap ${amountIn} ${inputTokenDetails.assetSymbol} to ${amountOut} ${outputTokenDetails.assetSymbol}`
    );
  }
}
