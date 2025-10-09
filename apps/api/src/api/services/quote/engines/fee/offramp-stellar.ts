import { EvmToken, RampCurrency, RampDirection } from "@packages/shared";
import { calculateFeeComponents } from "../../core/quote-fees";
import { QuoteContext, Stage, StageKey } from "../../core/types";
import { assignFeeSummary } from "./index";

export class OffRampFeeStellarEngine implements Stage {
  readonly key = StageKey.Fee;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.SELL) {
      ctx.addNote?.("Skipped for on-ramp request");
      return;
    }

    const outputAmountOfframp = ctx.nablaSwap?.outputAmountDecimal?.toString() ?? "0";

    const { anchorFee, feeCurrency, partnerMarkupFee, vortexFee } = await calculateFeeComponents({
      from: req.from,
      inputAmount: req.inputAmount,
      inputCurrency: req.inputCurrency,
      outputAmountOfframp,
      outputCurrency: req.outputCurrency,
      partnerName: ctx.partner?.id || undefined,
      rampType: req.rampType,
      to: req.to
    });

    await assignFeeSummary(ctx, {
      anchor: { amount: anchorFee, currency: feeCurrency },
      network: { amount: "0", currency: EvmToken.USDC as RampCurrency },
      partnerMarkup: { amount: partnerMarkupFee, currency: feeCurrency },
      vortex: { amount: vortexFee, currency: feeCurrency }
    });
  }
}
