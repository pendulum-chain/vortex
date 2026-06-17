import { BrlaApiService, EvmToken, FiatToken, RampCurrency, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { QuoteContext } from "../../core/types";
import { BaseFeeEngine, FeeComputation, FeeConfig } from "./index";

export class OffRampFeeAveniaEngine extends BaseFeeEngine {
  readonly config: FeeConfig = {
    direction: RampDirection.SELL,
    skipNote: "Skipped for on-ramp request"
  };

  protected validate(ctx: QuoteContext): void {
    if (!ctx.nablaSwap && !ctx.nablaSwapEvm) {
      throw new Error("OffRampFeeAveniaEngine requires nablaSwap or nablaSwapEvm in context");
    }
  }

  protected async compute(ctx: QuoteContext, anchorFee: string, feeCurrency: RampCurrency): Promise<FeeComputation> {
    const swap = ctx.nablaSwap ?? ctx.nablaSwapEvm;
    if (!swap) {
      throw new Error("OffRampFeeAveniaEngine requires nablaSwap or nablaSwapEvm in context");
    }
    const outputAmountOfframp = swap.outputAmountDecimal.toFixed(2, 0);

    const brlaApiService = BrlaApiService.getInstance();
    const aveniaQuote = await brlaApiService.createPayOutQuote(
      {
        outputAmount: outputAmountOfframp,
        outputThirdParty: false
      },
      { useCache: true }
    );

    const computedAnchorFee = new Big(aveniaQuote.inputAmount).minus(aveniaQuote.outputAmount).toString();
    const anchorFeeCurrency = FiatToken.BRL as RampCurrency;

    return {
      anchor: { amount: computedAnchorFee, currency: anchorFeeCurrency },
      network: { amount: "0", currency: EvmToken.USDC as RampCurrency }
    };
  }
}
