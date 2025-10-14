import {
  AssetHubToken,
  assethubTokenConfig,
  createHydrationToAssethubTransfer,
  multiplyByPowerOfTen,
  RampCurrency,
  RampDirection
} from "@packages/shared";
import Big from "big.js";
import HydrationRouter from "../../../hydration/swap";
import { priceFeedService } from "../../../priceFeed.service";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampHydrationEngine implements Stage {
  readonly key = StageKey.HydrationSwap;

  private price = priceFeedService;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("Skipped for off-ramp request");
      return;
    }

    if (!ctx.pendulumToHydrationXcm) {
      throw new Error("OnRampHydrationEngine requires pendulumToHydrationXcm in context");
    }

    // We will always use Assethub USDC as the input token of the swap
    const inputTokenDetails = assethubTokenConfig[AssetHubToken.USDC];
    const outputTokenDetails = assethubTokenConfig[req.outputCurrency as AssetHubToken];

    const assetIn = inputTokenDetails.hydrationId;
    const assetOut = outputTokenDetails.hydrationId;
    const amountIn = ctx.pendulumToHydrationXcm.outputAmountDecimal.toString();

    const trade = await HydrationRouter.getBestSellPriceFor(assetIn, assetOut, amountIn);

    const amountInRaw = trade.amountIn.toString();
    const amountOutRaw = trade.amountOut.toString();
    const assetOutDecimals = trade.swaps[trade.swaps.length - 1].assetOutDecimals;
    const amountOut = multiplyByPowerOfTen(amountOutRaw, -assetOutDecimals).toFixed(assetOutDecimals);

    const slippagePercent = 0.1; // We hardcode slippage to 0.1 for now
    const amountOutMin = new Big(amountOut).mul(new Big(1).minus(slippagePercent / 100)).toString();
    const amountOutMinRaw = multiplyByPowerOfTen(amountOutMin, assetOutDecimals).toString();

    const dummyDestination = "5DqTNJsGp6UayR5iHAZvH4zquY6ni6j35ZXLtJA6bXwsfixg";
    const { fees: xcmFees } = await createHydrationToAssethubTransfer(dummyDestination, amountOutRaw, assetOut);

    ctx.hydrationSwap = {
      inputAmountDecimal: amountIn,
      inputAmountRaw: amountInRaw,
      inputAsset: assetIn,
      minOutputAmountDecimal: amountOutMin,
      minOutputAmountRaw: amountOutMinRaw,
      outputAmountDecimal: amountOut,
      outputAmountRaw: amountOutRaw,
      outputAsset: assetOut,
      slippagePercent
    };

    // Calculations for XCM transfer
    // To be safe, we use the minimum output amount for XCM transfer calculations
    const xcmInputAmountDecimal = Big(amountOutMin);
    const xcmInputAmountRaw = Big(amountOutMinRaw);

    // Calculate gross output after subtracting XCM fees
    const originFeeInTargetCurrency = await this.price.convertCurrency(
      xcmFees.origin.amount,
      xcmFees.origin.currency as RampCurrency,
      req.outputCurrency
    );
    const destinationFeeInTargetCurrency = await this.price.convertCurrency(
      xcmFees.destination.amount,
      xcmFees.destination.currency as RampCurrency,
      req.outputCurrency
    );

    const outputAmountDecimal = new Big(xcmInputAmountDecimal)
      .minus(originFeeInTargetCurrency)
      .minus(destinationFeeInTargetCurrency);
    const outputAmountRaw = multiplyByPowerOfTen(outputAmountDecimal, outputTokenDetails.decimals).toString();

    ctx.hydrationToAssethubXcm = {
      fromToken: outputTokenDetails.assetSymbol,
      inputAmountDecimal: xcmInputAmountDecimal,
      inputAmountRaw: xcmInputAmountRaw.toString(),
      outputAmountDecimal,
      outputAmountRaw,
      toToken: outputTokenDetails.assetSymbol,
      xcmFees
    };

    ctx.addNote?.(`Swap ${amountIn} ${inputTokenDetails.assetSymbol} to ${amountOut} ${outputTokenDetails.assetSymbol}`);
  }
}
