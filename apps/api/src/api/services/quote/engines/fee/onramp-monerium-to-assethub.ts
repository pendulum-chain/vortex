import { EvmToken, RampDirection } from "@packages/shared";
import { priceFeedService } from "../../../priceFeed.service";
import { calculateFeeComponents } from "../../core/quote-fees";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampMoneriumToAssethubFeeEngine implements Stage {
  readonly key = StageKey.OnRampFee;
  private price = priceFeedService;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("OnRampFeeEngine: skipped for off-ramp request");
      return;
    }

    if (!ctx.evmToMoonbeam) {
      throw new Error("OnRampFeeEngine: evmToMoonbeam quote data is required");
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

    const usdCurrency = EvmToken.USDC;
    const vortexFeeUsd = await this.price.convertCurrency(vortexFee, feeCurrency, usdCurrency);
    const anchorFeeUsd = await this.price.convertCurrency(anchorFee, feeCurrency, usdCurrency);
    const partnerMarkupFeeUsd = await this.price.convertCurrency(partnerMarkupFee, feeCurrency, usdCurrency);
    const networkFeeUsd = ctx.evmToMoonbeam.networkFeeUSD;

    const displayCurrency = ctx.targetFeeFiatCurrency;
    let vortexFeeDisplay = vortexFee;
    let anchorFeeDisplay = anchorFee;
    let partnerMarkupFeeDisplay = partnerMarkupFee;
    let networkFeeDisplay = networkFeeUsd;

    if (feeCurrency !== displayCurrency) {
      vortexFeeDisplay = await this.price.convertCurrency(vortexFee, feeCurrency, displayCurrency);
      anchorFeeDisplay = await this.price.convertCurrency(anchorFee, feeCurrency, displayCurrency);
      partnerMarkupFeeDisplay = await this.price.convertCurrency(partnerMarkupFee, feeCurrency, displayCurrency);
      networkFeeDisplay = await this.price.convertCurrency(networkFeeUsd, usdCurrency, displayCurrency);
    }

    ctx.fees = {
      displayFiat: {
        anchor: anchorFeeDisplay,
        currency: displayCurrency,
        network: networkFeeDisplay,
        partnerMarkup: partnerMarkupFeeDisplay,
        total: (
          Number(vortexFeeDisplay) +
          Number(anchorFeeDisplay) +
          Number(partnerMarkupFeeDisplay) +
          Number(networkFeeDisplay)
        ).toFixed(2),
        vortex: vortexFeeDisplay
      },
      usd: {
        anchor: anchorFeeUsd,
        network: networkFeeDisplay,
        partnerMarkup: partnerMarkupFeeUsd,
        total: (Number(vortexFeeUsd) + Number(anchorFeeUsd) + Number(partnerMarkupFeeUsd) + Number(networkFeeUsd)).toFixed(6),
        vortex: vortexFeeUsd
      }
    };

    // biome-ignore lint/style/noNonNullAssertion: Justification: checked above
    const usd = ctx.fees.usd!;
    ctx.addNote?.(
      `OnRampFeeEngine: usd[vortex=${usd.vortex}, anchor=${usd.anchor}, partner=${usd.partnerMarkup}, network=${usd.network}] display=${displayCurrency}`
    );
  }
}
