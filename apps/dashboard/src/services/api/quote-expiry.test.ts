import type { QuoteResponse } from "@vortexfi/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getQuoteRefetchInterval, shouldRefreshQuote } from "./quote-expiry";

function quote(createdAt: string, expiresAt: string): QuoteResponse {
  return { createdAt, expiresAt } as unknown as QuoteResponse;
}

describe("quote expiry", () => {
  const createdAt = "2026-07-27T12:00:00.000Z";
  const expiresAt = "2026-07-27T12:00:30.000Z";

  it("schedules refresh when 60% of validity remains", () => {
    const now = new Date(createdAt).getTime();

    assert.equal(getQuoteRefetchInterval(quote(createdAt, expiresAt), now), 12_000);
    assert.equal(shouldRefreshQuote(quote(createdAt, expiresAt), now + 11_999), false);
    assert.equal(shouldRefreshQuote(quote(createdAt, expiresAt), now + 12_000), true);
  });

  it("retries soon for expired or invalid quote timestamps", () => {
    const now = new Date(expiresAt).getTime();

    assert.equal(getQuoteRefetchInterval(quote(createdAt, expiresAt), now), 5_000);
    assert.equal(shouldRefreshQuote(quote(createdAt, expiresAt), now), true);
    assert.equal(getQuoteRefetchInterval(quote("invalid", expiresAt), now), 5_000);
    assert.equal(shouldRefreshQuote(quote("invalid", expiresAt), now), true);
  });
});
