import {
  AveniaPaymentMethod,
  BrlaApiService,
  BrlaCurrency,
  EvmToken,
  FiatToken,
  RampCurrency,
  RampDirection
} from "@packages/shared";
import Big from "big.js";
import { calculateFeeComponents } from "../../core/quote-fees";
import { QuoteContext, Stage, StageKey } from "../../core/types";
import { assignFeeSummary } from "./index";

export class OffRampFeeAveniaEngine implements Stage {
  readonly key = StageKey.Fee;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.SELL) {
      ctx.addNote?.("Skipped for on-ramp request");
      return;
    }

    if (!ctx.nablaSwap) {
      throw new Error("OffRampFeeAveniaEngine requires nablaSwap in context");
    }

    const outputAmountOfframp = ctx.nablaSwap.outputAmountDecimal.toFixed(2, 0);

    const { feeCurrency, partnerMarkupFee, vortexFee } = await calculateFeeComponents({
      from: req.from,
      inputAmount: req.inputAmount,
      inputCurrency: req.inputCurrency,
      outputAmountOfframp,
      outputCurrency: req.outputCurrency,
      partnerName: ctx.partner?.id || undefined,
      rampType: req.rampType,
      to: req.to
    });

    const brlaApiService = BrlaApiService.getInstance();
    const aveniaQuote = await brlaApiService.createPayOutQuote({
      outputAmount: outputAmountOfframp,
      outputThirdParty: false
    });

    const anchorFee = new Big(aveniaQuote.inputAmount).minus(aveniaQuote.outputAmount).toString();
    const anchorFeeCurrency = FiatToken.BRL as RampCurrency;

    await assignFeeSummary(ctx, {
      anchor: { amount: anchorFee, currency: anchorFeeCurrency },
      network: { amount: "0", currency: EvmToken.USDC as RampCurrency },
      partnerMarkup: { amount: partnerMarkupFee, currency: feeCurrency },
      vortex: { amount: vortexFee, currency: feeCurrency }
    });
  }
}
