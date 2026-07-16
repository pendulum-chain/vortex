import { EvmToken, RampCurrency } from "@vortexfi/shared";
import Big from "big.js";
import { priceFeedService } from "../../../priceFeed.service";
import { calculateFeeComponents } from "../../core/quote-fees";
import type { PhaseCtx } from "./types";

export async function computeFees(ctx: PhaseCtx): Promise<void> {
  if (ctx.fees) return;

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
  const [vortexUsd, anchorUsd, partnerUsd] = await Promise.all([
    priceFeedService.convertCurrency(vortexFee, feeCurrency, USD),
    priceFeedService.convertCurrency(anchorFee, feeCurrency, USD),
    priceFeedService.convertCurrency(partnerMarkupFee, feeCurrency, USD)
  ]);

  const networkUsd = "0";
  const networkDisplay = "0";
  const totalUsd = new Big(vortexUsd).plus(anchorUsd).plus(partnerUsd).plus(networkUsd).toFixed(6);
  const totalDisplay = new Big(vortexFee).plus(anchorFee).plus(partnerMarkupFee).toFixed(2);

  ctx.fees = {
    displayFiat: {
      anchor: anchorFee,
      currency: feeCurrency,
      network: networkDisplay,
      partnerMarkup: partnerMarkupFee,
      total: totalDisplay,
      vortex: vortexFee
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
