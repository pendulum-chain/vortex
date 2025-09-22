// PR1 scaffolding: Off-ramp to PIX strategy
// Returns an empty stage list for PR1 (no runtime behavior change).

import { IRouteStrategy, QuoteContext, StageKey } from "../../types";

export class OffRampPixStrategy implements IRouteStrategy {
  readonly name = "OffRampPix";

  getStages(_ctx: QuoteContext): StageKey[] {
    // PR1: no-op to avoid behavior changes. Will be populated in subsequent PRs.
    return [];
  }
}
