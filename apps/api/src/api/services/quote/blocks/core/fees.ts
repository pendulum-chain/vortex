import { EvmToken, RampCurrency } from "@vortexfi/shared";
import Big from "big.js";
import { priceFeedService } from "../../../priceFeed.service";
import { calculateFeeComponents } from "../../core/quote-fees";
import type { PhaseCtx } from "./types";

interface FeeOverride {
  anchor: { amount: string; currency: RampCurrency };
  network?: { amount: string; currency: RampCurrency };
}

export async function calculateFees(ctx: PhaseCtx, override?: FeeOverride): Promise<NonNullable<PhaseCtx["fees"]>> {
  const { vortexFee, anchorFee, partnerMarkupFee, feeCurrency } = await calculateFeeComponents({
    from: ctx.request.from,
    inputAmount: ctx.request.inputAmount,
    inputCurrency: ctx.request.inputCurrency,
    outputAmountOfframp: "0",
    outputCurrency: ctx.request.outputCurrency,
    partnerId: ctx.partner?.id || undefined,
    rampType: ctx.request.rampType,
    to: ctx.request.to
  });

  const USD = EvmToken.USDC as RampCurrency;
  const displayCurrency = ctx.targetFeeFiatCurrency ?? feeCurrency;
  const anchor = override?.anchor ?? { amount: anchorFee, currency: feeCurrency };
  const network = override?.network ?? { amount: "0", currency: USD };
  const [vortexUsd, anchorUsd, partnerUsd, networkUsd, vortexDisplay, anchorDisplay, partnerDisplay, networkDisplay] =
    await Promise.all([
      priceFeedService.convertCurrency(vortexFee, feeCurrency, USD),
      priceFeedService.convertCurrency(anchor.amount, anchor.currency, USD),
      priceFeedService.convertCurrency(partnerMarkupFee, feeCurrency, USD),
      priceFeedService.convertCurrency(network.amount, network.currency, USD),
      priceFeedService.convertCurrency(vortexFee, feeCurrency, displayCurrency),
      priceFeedService.convertCurrency(anchor.amount, anchor.currency, displayCurrency),
      priceFeedService.convertCurrency(partnerMarkupFee, feeCurrency, displayCurrency),
      priceFeedService.convertCurrency(network.amount, network.currency, displayCurrency)
    ]);

  const totalUsd = new Big(vortexUsd).plus(anchorUsd).plus(partnerUsd).plus(networkUsd).toFixed(6);
  const totalDisplay = new Big(vortexDisplay).plus(anchorDisplay).plus(partnerDisplay).plus(networkDisplay).toFixed(2);

  return {
    displayFiat: {
      anchor: anchorDisplay,
      currency: displayCurrency,
      network: networkDisplay,
      partnerMarkup: partnerDisplay,
      total: totalDisplay,
      vortex: vortexDisplay
    },
    usd: {
      anchor: anchorUsd,
      network: networkUsd,
      partnerMarkup: partnerUsd,
      total: totalUsd,
      vortex: vortexUsd
    }
  };
}

export async function computeFees(ctx: PhaseCtx): Promise<void> {
  if (!ctx.fees) ctx.fees = await calculateFees(ctx);
}
