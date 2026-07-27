import { useQuery } from "@tanstack/react-query";
import { fetchQuote, type QuoteParams } from "./quote.service";
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
