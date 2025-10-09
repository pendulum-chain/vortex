import { EvmToken, RampCurrency, RampDirection } from "@packages/shared";
import { calculateFeeComponents } from "../../core/quote-fees";
import { QuoteContext, Stage, StageKey } from "../../core/types";
import { assignFeeSummary } from "./index";

export class OnRampMoneriumToAssethubFeeEngine implements Stage {
  readonly key = StageKey.Fee;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("Skipped for off-ramp request");
      return;
    }

    if (!ctx.evmToMoonbeam) {
      throw new Error("OnRampMoneriumToAssethubFeeEngine: evmToMoonbeam quote data is required");
    }

    const { anchorFee, feeCurrency, partnerMarkupFee, vortexFee } = await calculateFeeComponents({
      from: req.from,
      inputAmount: req.inputAmount,
      inputCurrency: req.inputCurrency,
      outputCurrency: req.outputCurrency,
      partnerName: ctx.partner?.id || undefined,
      rampType: req.rampType,
      to: req.to
    });

    await assignFeeSummary(ctx, {
      anchor: { amount: anchorFee, currency: feeCurrency },
      network: { amount: ctx.evmToMoonbeam.networkFeeUSD, currency: EvmToken.USDC as RampCurrency },
      partnerMarkup: { amount: partnerMarkupFee, currency: feeCurrency },
      vortex: { amount: vortexFee, currency: feeCurrency }
    });
  }
}
