import { EvmToken, FiatToken, RampCurrency, RampDirection } from "@packages/shared";
import { QuoteContext, Stage, StageKey } from "../../core/types";
import { assignFeeSummary } from "./index";

export class OnRampMoneriumToEvmFeeEngine implements Stage {
  readonly key = StageKey.Fee;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("Skipped for off-ramp request");
      return;
    }

    await assignFeeSummary(ctx, {
      anchor: { amount: "0", currency: FiatToken.EURC as RampCurrency },
      network: { amount: "0", currency: EvmToken.USDC as RampCurrency },
      partnerMarkup: { amount: "0", currency: FiatToken.EURC as RampCurrency },
      vortex: { amount: "0", currency: FiatToken.EURC as RampCurrency }
    });
  }
}
