import type { QuoteResponse } from "@vortexfi/shared";
import Big from "big.js";
import type QuoteTicket from "../../../../../models/quoteTicket.model";
import { trimTrailingZeros } from "../../core/helpers";
import { getFlowMetadata } from "./metadata";

export function buildBlockQuoteResponse(quote: QuoteTicket): QuoteResponse {
  const { fees, subsidyDisplay } = getFlowMetadata(quote.metadata).globals;
  const fiatFees = fees.displayFiat;
  if (!fiatFees) {
    throw new Error("Quote does not contain display fee metadata");
  }

  return {
    anchorFeeFiat: fiatFees.anchor,
    anchorFeeUsd: fees.usd.anchor,
    createdAt: quote.createdAt,
    expiresAt: quote.expiresAt,
    feeCurrency: fiatFees.currency,
    from: quote.from,
    id: quote.id,
    inputAmount: trimTrailingZeros(quote.inputAmount),
    inputCurrency: quote.inputCurrency,
    network: quote.network,
    networkFeeFiat: fiatFees.network,
    networkFeeUsd: fees.usd.network,
    outputAmount: trimTrailingZeros(quote.outputAmount),
    outputCurrency: quote.outputCurrency,
    partnerFeeFiat: fiatFees.partnerMarkup,
    partnerFeeUsd: fees.usd.partnerMarkup,
    paymentMethod: quote.paymentMethod,
    processingFeeFiat: new Big(fiatFees.anchor).plus(fiatFees.vortex).toFixed(),
    processingFeeUsd: new Big(fees.usd.anchor).plus(fees.usd.vortex).toFixed(),
    rampType: quote.rampType,
    ...(subsidyDisplay
      ? {
          discountCurrency: subsidyDisplay.currency,
          discountFiat: subsidyDisplay.fiat,
          discountUsd: subsidyDisplay.usd
        }
      : {}),
    to: quote.to,
    totalFeeFiat: fiatFees.total,
    totalFeeUsd: fees.usd.total,
    vortexFeeFiat: fiatFees.vortex,
    vortexFeeUsd: fees.usd.vortex
  };
}
