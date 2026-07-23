import {
  type CreateQuoteRequest,
  type EvmNetworks,
  EvmToken,
  type OnChainToken,
  type QuoteResponse,
  RampDirection
} from "@vortexfi/shared";
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

export interface OnrampQuoteParams {
  corridorId: CorridorId;
  /** Validated decimal string, passed to the wire untouched to preserve precision. */
  inputAmount: string;
  network: EvmNetworks;
  outputCurrency: OnChainToken;
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

export interface QuoteParams {
  corridorId: CorridorId;
  direction: RampDirection;
  /** Validated decimal string, passed to the wire untouched to preserve precision. */
  inputAmount: string;
  network: EvmNetworks;
  /** The on-chain leg: bought on BUY, sold on SELL. */
  token: OnChainToken;
}

/**
 * Input-driven quote in either direction — the shape `/quotes` natively speaks. Unlike
 * `fetchOfframpQuote`, a SELL here quotes what the *sender* puts in rather than inverting
 * from a target payout, so no rate estimate and no second pass are needed.
 */
export function buildQuoteRequest(params: QuoteParams): CreateQuoteRequest {
  const { corridorId, direction, inputAmount, network, token } = params;
  const fiat = CORRIDOR_FIAT[corridorId];
  const paymentMethod = CORRIDOR_PAYMENT_METHOD[corridorId];
  const isBuy = direction === RampDirection.BUY;

  return {
    countryCode: CORRIDOR_COUNTRY[corridorId],
    from: isBuy ? paymentMethod : network,
    inputAmount,
    inputCurrency: isBuy ? fiat : token,
    network,
    outputCurrency: isBuy ? token : fiat,
    paymentMethod,
    rampType: direction,
    to: isBuy ? network : paymentMethod
  };
}

export function fetchQuote(params: QuoteParams): Promise<QuoteResponse> {
  return apiClient.post<QuoteResponse>("/quotes", buildQuoteRequest(params));
}

export function buildOnrampQuoteRequest(params: OnrampQuoteParams): CreateQuoteRequest {
  return {
    countryCode: CORRIDOR_COUNTRY[params.corridorId],
    from: CORRIDOR_PAYMENT_METHOD[params.corridorId],
    inputAmount: params.inputAmount,
    inputCurrency: CORRIDOR_FIAT[params.corridorId],
    network: params.network,
    outputCurrency: params.outputCurrency,
    paymentMethod: CORRIDOR_PAYMENT_METHOD[params.corridorId],
    rampType: RampDirection.BUY,
    to: params.network
  };
}

export function fetchOnrampQuote(params: OnrampQuoteParams): Promise<QuoteResponse> {
  return apiClient.post<QuoteResponse>("/quotes", buildOnrampQuoteRequest(params));
}
