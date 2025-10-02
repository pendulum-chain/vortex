import {
  AXL_USDC_MOONBEAM,
  EvmToken,
  getNetworkFromDestination,
  Networks,
  OnChainToken,
  RampDirection
} from "@packages/shared";
import { priceFeedService } from "../../../priceFeed.service";
import { calculateFeeComponents } from "../../core/quote-fees";
import { calculateEvmBridgeAndNetworkFee, getTokenDetailsForEvmDestination } from "../../core/squidrouter";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampAveniaToAssethubFeeEngine implements Stage {
  readonly key = StageKey.OnRampFee;
  private price = priceFeedService;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("OnRampFeeAveniaToAssethubEngine: skipped for off-ramp request");
      return;
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

    const toNetwork = getNetworkFromDestination(req.to);
    if (!toNetwork) {
      throw new Error(`OnRampFeeAveniaToAssethubEngine: invalid network for destination: ${req.to}`);
    }

    const usdCurrency = EvmToken.USDC;
    const vortexFeeUsd = await this.price.convertCurrency(vortexFee, feeCurrency, usdCurrency);
    const anchorFeeUsd = await this.price.convertCurrency(anchorFee, feeCurrency, usdCurrency);
    const partnerMarkupFeeUsd = await this.price.convertCurrency(partnerMarkupFee, feeCurrency, usdCurrency);
    const networkFeeUsd = "0.03"; // FIXME We don't have a good estimate for XCM fees yet

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
        network: networkFeeUsd,
        partnerMarkup: partnerMarkupFeeUsd,
        total: (Number(vortexFeeUsd) + Number(anchorFeeUsd) + Number(partnerMarkupFeeUsd) + Number(networkFeeUsd)).toFixed(6),
        vortex: vortexFeeUsd
      }
    };

    // biome-ignore lint/style/noNonNullAssertion: Justification: checked above
    const usd = ctx.fees.usd!;
    ctx.addNote?.(
      `OnRampFeeAveniaToAssethubEngine: usd[vortex=${usd.vortex}, anchor=${usd.anchor}, partner=${usd.partnerMarkup}, network=${usd.network}] display=${displayCurrency}`
    );
  }
}
