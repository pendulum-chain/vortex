import { EvmToken, RampDirection } from "@packages/shared";
import { PriceFeedAdapter } from "../../adapters/price-feed-adapter";
import { calculateFeeComponents } from "../../quote-fees";
import { QuoteContext, Stage, StageKey } from "../../types";

export class OffRampFeeEngine implements Stage {
  readonly key = StageKey.OffRampFee;
  private price = new PriceFeedAdapter();

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.SELL) {
      ctx.addNote?.("OffRampFeeEngine: skipped for on-ramp request");
      return;
    }

    const outputAmountOfframp = ctx.nabla?.outputAmountDecimal?.toString() ?? "0";

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

    const usdCurrency = EvmToken.USDC;
    const vortexFeeUsd = await this.price.convertCurrency(vortexFee, feeCurrency, usdCurrency);
    const anchorFeeUsd = await this.price.convertCurrency(anchorFee, feeCurrency, usdCurrency);
    const partnerMarkupFeeUsd = await this.price.convertCurrency(partnerMarkupFee, feeCurrency, usdCurrency);

    const displayCurrency = ctx.targetFeeFiatCurrency;
    let vortexFeeDisplay = vortexFee;
    let anchorFeeDisplay = anchorFee;
    let partnerMarkupFeeDisplay = partnerMarkupFee;

    if (feeCurrency !== displayCurrency) {
      vortexFeeDisplay = await this.price.convertCurrency(vortexFee, feeCurrency, displayCurrency);
      anchorFeeDisplay = await this.price.convertCurrency(anchorFee, feeCurrency, displayCurrency);
      partnerMarkupFeeDisplay = await this.price.convertCurrency(partnerMarkupFee, feeCurrency, displayCurrency);
    }

    ctx.fees = {
      displayFiat: {
        anchor: anchorFeeDisplay,
        currency: displayCurrency,
        network: "0",
        partnerMarkup: partnerMarkupFeeDisplay,
        total: (Number(vortexFeeDisplay) + Number(anchorFeeDisplay) + Number(partnerMarkupFeeDisplay)).toFixed(2),
        vortex: vortexFeeDisplay
      },
      usd: {
        anchor: anchorFeeUsd,
        network: "0",
        partnerMarkup: partnerMarkupFeeUsd,
        total: (Number(vortexFeeUsd) + Number(anchorFeeUsd) + Number(partnerMarkupFeeUsd)).toFixed(6),
        vortex: vortexFeeUsd
      }
    };

    // biome-ignore lint/style/noNonNullAssertion: Justification: checked above
    const usd = ctx.fees.usd!;
    ctx.addNote?.(
      `OffRampFeeEngine: usd[vortex=${usd.vortex}, anchor=${usd.anchor}, partner=${usd.partnerMarkup}] display=${displayCurrency}`
    );
  }
}
