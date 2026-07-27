import { useQuery } from "@tanstack/react-query";
import { fetchOfframpQuote, fetchQuote, type OfframpQuoteParams, type QuoteParams } from "./quote.service";
import { getQuoteRefetchInterval } from "./quote-expiry";

/** Indicative, input-driven quote in either direction. Pass null while the form is incomplete. */
export function useQuote(params: QuoteParams | null) {
  return useQuery({
    enabled: params !== null,
    queryFn: () => fetchQuote(params as QuoteParams),
    queryKey: ["quote", params],
    refetchInterval: query => getQuoteRefetchInterval(query.state.data),
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true
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
    refetchInterval: query => getQuoteRefetchInterval(query.state.data),
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true
  });
}
