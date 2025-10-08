import { FiatToken, RampDirection } from "@packages/shared";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampMoneriumToEvmFeeEngine implements Stage {
  readonly key = StageKey.OnRampFee;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("Skipped for off-ramp request");
      return;
    }

    // For now, we don't charge any fees for this path
    ctx.fees = {
      displayFiat: {
        anchor: "0",
        currency: FiatToken.EURC,
        network: "0",
        partnerMarkup: "0",
        total: "0",
        vortex: "0"
      },
      usd: {
        anchor: "0",
        network: "0",
        partnerMarkup: "0",
        total: "0",
        vortex: "0"
      }
    };

    // biome-ignore lint/style/noNonNullAssertion: Justification: checked above
    const usd = ctx.fees.usd!;
    ctx.addNote?.(
      `Fees: usd[vortex=${usd.vortex}, anchor=${usd.anchor}, partner=${usd.partnerMarkup}, network=${usd.network}]}`
    );
  }
}
