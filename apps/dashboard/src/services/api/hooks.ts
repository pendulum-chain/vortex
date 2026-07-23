import { useQuery } from "@tanstack/react-query";
import {
  fetchOfframpQuote,
  fetchOnrampQuote,
  fetchQuote,
  type OfframpQuoteParams,
  type OnrampQuoteParams,
  type QuoteParams
} from "./quote.service";

const QUOTE_REFRESH_MS = 60_000;

/** Indicative, input-driven quote in either direction. Pass null while the form is incomplete. */
export function useQuote(params: QuoteParams | null) {
  return useQuery({
    enabled: params !== null,
    queryFn: () => fetchQuote(params as QuoteParams),
    queryKey: ["quote", params?.direction, params?.corridorId, params?.inputAmount, params?.network, params?.token],
    refetchInterval: QUOTE_REFRESH_MS,
    staleTime: QUOTE_REFRESH_MS
  });
}

/**
 * Fetches an offramp quote and auto-refreshes it before it expires, mirroring the
 * widget's quote-refresh behaviour. Pass null to disable (no recipient selected yet).
 */
export function useOfframpQuote(params: OfframpQuoteParams | null) {
  return useQuery({
    enabled: params !== null,
    queryFn: () => fetchOfframpQuote(params as OfframpQuoteParams),
    queryKey: ["offramp-quote", params?.corridorId, params?.payoutAmount, params?.network],
    refetchInterval: QUOTE_REFRESH_MS,
    staleTime: QUOTE_REFRESH_MS
  });
}

export function useOnrampQuote(params: OnrampQuoteParams | null) {
  return useQuery({
    enabled: params !== null,
    queryFn: () => fetchOnrampQuote(params as OnrampQuoteParams),
    queryKey: ["onramp-quote", params?.corridorId, params?.inputAmount, params?.network, params?.outputCurrency],
    refetchInterval: QUOTE_REFRESH_MS,
    staleTime: QUOTE_REFRESH_MS
  });
}
