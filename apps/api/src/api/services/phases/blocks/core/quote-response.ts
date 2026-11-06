import type { QuoteResponse } from "@vortexfi/shared";
import Big from "big.js";
import { formatEther } from "viem";
import type QuoteTicket from "../../../../../models/quoteTicket.model";
import { trimTrailingZeros } from "./helpers";
import { type FlowGlobals, getFlowMetadata } from "./metadata";

/** Nothing when no ETH is delivered, so a funded wallet's quote reads like any other. */
export function gasReserveResponseFields(gasReserve: FlowGlobals["gasReserve"]) {
  if (!gasReserve || gasReserve.amountRaw === "0") return {};
  return {
    gasReserveAmount: formatEther(BigInt(gasReserve.amountRaw)),
    gasReserveCurrency: gasReserve.currency,
    gasReserveFiat: gasReserve.fiat,
    gasReserveUsd: gasReserve.usd
  };
}

/** Only the stock flows set these, so every other corridor's response stays as it was. */
export function stockQuoteResponseFields({ gasless, gasReserve, providerCosts, routingStrategy }: FlowGlobals) {
  return {
    ...(gasless === undefined ? {} : { gasless }),
    ...gasReserveResponseFields(gasReserve),
    ...(providerCosts ? { providerCosts } : {}),
    ...(routingStrategy ? { routingStrategy } : {})
  };
}

export function buildBlockQuoteResponse(quote: QuoteTicket): QuoteResponse {
  const { globals } = getFlowMetadata(quote.metadata);
  const { fees, subsidyDisplay } = globals;
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
    ...stockQuoteResponseFields(globals),
    to: quote.to,
    totalFeeFiat: fiatFees.total,
    totalFeeUsd: fees.usd.total,
    vortexFeeFiat: fiatFees.vortex,
    vortexFeeUsd: fees.usd.vortex
  };
}
