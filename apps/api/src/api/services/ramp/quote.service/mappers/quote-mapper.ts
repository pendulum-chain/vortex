// PR1 scaffolding: Quote Mapper
// Purpose later: map QuoteContext + fee structures into QuoteResponse with consistent formatting.
// Current: stubbed helpers to be implemented in later PRs.

import { QuoteResponse } from "@packages/shared";
import type { QuoteContext } from "../types";

export class QuoteMapper {
  // Build a QuoteResponse from the context (to be implemented in PR5)
  buildResponse(_ctx: QuoteContext): QuoteResponse {
    throw new Error("QuoteMapper.buildResponse not implemented (PR1 scaffold)");
  }

  // Future helpers:
  // - formatting amounts by direction (BUY vs SELL)
  // - applying trimTrailingZeros
  // - selecting USD/display fiat fee structures consistently
}
