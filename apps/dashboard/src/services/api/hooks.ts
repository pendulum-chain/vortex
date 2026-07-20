import { useQuery } from "@tanstack/react-query";
import { fetchOfframpQuote, type OfframpQuoteParams } from "./quote.service";

const QUOTE_REFRESH_MS = 60_000;

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
