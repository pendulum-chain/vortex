// PR1 scaffolding: Persistence Adapter
// Purpose later: encapsulate QuoteTicket persistence and retrieval.
// Current: stub methods; no DB imports here to avoid behavior changes.

import { QuoteResponse } from "@packages/shared";

export interface PersistQuoteParams {
  // Minimal fields expected later; to be refined in PR5
  response: QuoteResponse;
  // Additional metadata can be added as needed
}

export class PersistenceAdapter {
  // Create a quote ticket and return identifiers for response composition
  async createQuote(_params: PersistQuoteParams): Promise<{ id: string; expiresAt: Date }> {
    // PR1: stubbed; implementation will be added in PR5
    throw new Error("PersistenceAdapter.createQuote not implemented (PR1 scaffold)");
  }
}
