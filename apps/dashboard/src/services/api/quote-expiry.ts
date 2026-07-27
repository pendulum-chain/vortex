import type { QuoteResponse } from "@vortexfi/shared";

const QUOTE_EXPIRY_THRESHOLD_PERCENTAGE = 60;
const QUOTE_REFRESH_RETRY_MS = 5_000;

function quoteTiming(quote: QuoteResponse, now: number) {
  const expires = new Date(quote.expiresAt).getTime();
  const created = new Date(quote.createdAt ?? now).getTime();
  const totalDuration = expires - created;
  const timeRemaining = expires - now;
  const percentageRemaining = totalDuration > 0 ? (timeRemaining / totalDuration) * 100 : 0;

  return { created, percentageRemaining, totalDuration };
}

export function shouldRefreshQuote(quote: QuoteResponse, now = Date.now()): boolean {
  const { percentageRemaining } = quoteTiming(quote, now);
  return !Number.isFinite(percentageRemaining) || percentageRemaining <= QUOTE_EXPIRY_THRESHOLD_PERCENTAGE;
}

export function getQuoteRefetchInterval(quote: QuoteResponse | undefined, now = Date.now()): number {
  if (!quote) {
    return QUOTE_REFRESH_RETRY_MS;
  }

  const { created, percentageRemaining, totalDuration } = quoteTiming(quote, now);
  if (!Number.isFinite(percentageRemaining) || percentageRemaining <= QUOTE_EXPIRY_THRESHOLD_PERCENTAGE) {
    return QUOTE_REFRESH_RETRY_MS;
  }

  const refreshAt = created + totalDuration * (1 - QUOTE_EXPIRY_THRESHOLD_PERCENTAGE / 100);
  return Math.max(refreshAt - now, QUOTE_REFRESH_RETRY_MS);
}
