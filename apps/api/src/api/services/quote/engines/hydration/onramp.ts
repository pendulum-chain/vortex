import {
  AssetHubToken,
  assetHubTokenConfig,
  createHydrationToAssethubTransfer,
  multiplyByPowerOfTen,
  RampCurrency,
  RampDirection,
  XcmFees
} from "@packages/shared";
import Big from "big.js";
import HydrationRouter from "../../../hydration/swap";
import { priceFeedService } from "../../../priceFeed.service";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampHydrationEngine implements Stage {
  readonly key = StageKey.OnRampHydration;

  private price = priceFeedService;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("Skipped for off-ramp request");
      return;
    }

    if (!ctx.nablaSwap?.outputAmountDecimal) {
      throw new Error("OnRampHydrationEngine requires nabla.outputAmountDecimal in context");
    }

    // We will always use Assethub USDC as the input token of the swap
    const inputTokenDetails = assetHubTokenConfig[AssetHubToken.USDC];
    const outputTokenDetails = assetHubTokenConfig[req.outputCurrency as AssetHubToken];

    const assetIn = inputTokenDetails.hydrationId;
    const assetOut = outputTokenDetails.hydrationId;
    const amountIn = ctx.nablaSwap.outputAmountDecimal.toFixed(inputTokenDetails.decimals);

    const trade = await HydrationRouter.getBestSellPriceFor(assetIn, assetOut, amountIn);

    const amountInRaw = trade.amountIn.toString();
    const amountOutRaw = trade.amountOut.toString();
    const assetOutDecimals = trade.swaps[trade.swaps.length - 1].assetOutDecimals;
    const amountOut = multiplyByPowerOfTen(amountOutRaw, -assetOutDecimals).toFixed(assetOutDecimals);

    const dummyDestination = "5DqTNJsGp6UayR5iHAZvH4zquY6ni6j35ZXLtJA6bXwsfixg";
    const { fees: xcmFees } = await createHydrationToAssethubTransfer(dummyDestination, amountOutRaw, assetOut);

    ctx.hydrationSwap = {
      amountIn,
      amountInRaw,
      amountOut,
      amountOutRaw,
      assetIn: assetIn,
      assetOut: assetOut
    };

    // Calculations for XCM transfer
    const xcmInputAmountDecimal = Big(amountOut);
    const xcmInputAmountRaw = Big(amountOutRaw);

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

    const outputAmountDecimal = new Big(ctx.hydrationSwap.amountOut)
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
