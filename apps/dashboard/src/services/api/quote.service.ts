import { type CreateQuoteRequest, EvmToken, type QuoteResponse, RampDirection } from "@vortexfi/shared";
import { USDC_RATES } from "@/domain/transfer";
import type { CorridorId } from "@/domain/types";
import { apiClient } from "./api-client";
import { CORRIDOR_COUNTRY, CORRIDOR_FIAT, CORRIDOR_PAYMENT_METHOD, toWireNetwork } from "./mappers";

export interface OfframpQuoteParams {
  corridorId: CorridorId;
  /** Fiat amount the recipient should receive, in the corridor's currency. */
  payoutAmount: number;
  /** Dashboard transfer-network id the stablecoin leg settles on. */
  network: string;
}

/** The wire request for an offramp (SELL) quote: sender sends USDC, recipient receives fiat. */
export function buildOfframpQuoteRequest(params: OfframpQuoteParams, inputAmount: string): CreateQuoteRequest {
  const { corridorId, network } = params;
  return {
    countryCode: CORRIDOR_COUNTRY[corridorId],
    from: toWireNetwork(network),
    inputAmount,
    inputCurrency: EvmToken.USDC,
    network: toWireNetwork(network),
    outputCurrency: CORRIDOR_FIAT[corridorId],
    paymentMethod: CORRIDOR_PAYMENT_METHOD[corridorId],
    rampType: RampDirection.SELL,
    to: CORRIDOR_PAYMENT_METHOD[corridorId]
  };
}

function requestQuote(params: OfframpQuoteParams, inputAmount: number): Promise<QuoteResponse> {
  return apiClient.post<QuoteResponse>("/quotes", buildOfframpQuoteRequest(params, inputAmount.toFixed(6)));
}

// Re-quote when the first pass lands further than this from the requested payout.
const PAYOUT_TOLERANCE = 0.005;

/**
 * Live offramp (SELL) quote for a target *payout* amount. The quote endpoint is
 * input-driven (USDC in), so we invert: estimate the input from a static rate, quote,
 * then refine once with the quoted effective rate. Fees are near-linear in amount, so
 * one refinement lands within tolerance.
 */
export async function fetchOfframpQuote(params: OfframpQuoteParams): Promise<QuoteResponse> {
  const { corridorId, payoutAmount } = params;

  const estimatedInput = payoutAmount / USDC_RATES[corridorId];
  const quote = await requestQuote(params, estimatedInput);

  const output = Number(quote.outputAmount);
  const input = Number(quote.inputAmount);
  if (output <= 0 || input <= 0 || Math.abs(output - payoutAmount) / payoutAmount <= PAYOUT_TOLERANCE) {
    return quote;
  }
  return requestQuote(params, (input * payoutAmount) / output);
}
