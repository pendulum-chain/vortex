import { EvmToken } from "@packages/shared";
import { PriceFeedAdapter } from "../adapters/price-feed-adapter";
import { calculateFeeComponents } from "../quote-fees";
import { QuoteContext, Stage, StageKey } from "../types";

/**
 * FeeEngine (PR4)
 * - Computes partner markup, vortex, and anchor fees using DB-driven logic (calculateFeeComponents).
 * - Normalizes to USD baseline and also provides display fiat (ctx.targetFeeFiatCurrency).
 * - Network fee remains 0 here; added later by bridge/network stages or legacy path.
 */
export class FeeEngine implements Stage {
  readonly key = StageKey.Fee;
  private price = new PriceFeedAdapter();

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    // Use Nabla output as "outputAmountOfframp" for SELL; for BUY it's fine to pass the intermediate gross output
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

    // Convert to USD baseline
    const usdCurrency = EvmToken.USDC;
    const vortexFeeUsd = await this.price.convertCurrency(vortexFee, feeCurrency, usdCurrency);
    const anchorFeeUsd = await this.price.convertCurrency(anchorFee, feeCurrency, usdCurrency);
    const partnerMarkupFeeUsd = await this.price.convertCurrency(partnerMarkupFee, feeCurrency, usdCurrency);

    // Convert to target display fiat currency if needed
    const displayCurrency = ctx.targetFeeFiatCurrency;
    let vortexFeeDisplay = vortexFee;
    let anchorFeeDisplay = anchorFee;
    let partnerMarkupFeeDisplay = partnerMarkupFee;

    if (feeCurrency !== displayCurrency) {
      vortexFeeDisplay = await this.price.convertCurrency(vortexFee, feeCurrency, displayCurrency);
      anchorFeeDisplay = await this.price.convertCurrency(anchorFee, feeCurrency, displayCurrency);
      partnerMarkupFeeDisplay = await this.price.convertCurrency(partnerMarkupFee, feeCurrency, displayCurrency);
    }

    // Store on context
    ctx.fees = {
      displayFiat: {
        currency: displayCurrency,
        structure: {
          anchor: anchorFeeDisplay,
          currency: displayCurrency,
          network: "0",
          partnerMarkup: partnerMarkupFeeDisplay,
          total: (Number(vortexFeeDisplay) + Number(anchorFeeDisplay) + Number(partnerMarkupFeeDisplay)).toFixed(2),
          vortex: vortexFeeDisplay
        }
      },
      usd: {
        anchor: anchorFeeUsd,
        network: "0",
        partnerMarkup: partnerMarkupFeeUsd,
        total: (Number(vortexFeeUsd) + Number(anchorFeeUsd) + Number(partnerMarkupFeeUsd)).toFixed(6),
        vortex: vortexFeeUsd
      }
    };

    const usd = ctx.fees.usd!;
    ctx.addNote?.(
      `FeeEngine: usd[vortex=${usd.vortex}, anchor=${usd.anchor}, partner=${usd.partnerMarkup}] display=${displayCurrency}`
    );
  }
}
