import {
  type CreateQuoteRequest,
  type EvmNetworks,
  type OnChainToken,
  type QuoteResponse,
  RampDirection
} from "@vortexfi/shared";
import type { CorridorId } from "@/domain/types";
import { apiClient } from "./api-client";
import { CORRIDOR_COUNTRY, CORRIDOR_FIAT, CORRIDOR_PAYMENT_METHOD } from "./mappers";

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
 * Input-driven quote in either direction — the shape `/quotes` natively speaks.
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
  return apiClient.post<QuoteResponse>("/quotes", buildQuoteRequest(params), { managedProfile: true });
}
