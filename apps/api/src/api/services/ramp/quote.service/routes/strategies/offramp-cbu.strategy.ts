// PR1 scaffolding: Off-ramp to CBU strategy
// Returns an empty stage list for PR1 (no runtime behavior change).

import { IRouteStrategy, QuoteContext, StageKey } from "../../types";

export class OffRampCbuStrategy implements IRouteStrategy {
  readonly name = "OffRampCbu";

  getStages(_ctx: QuoteContext): StageKey[] {
    // PR1: no-op to avoid behavior changes. Will be populated in subsequent PRs.
    return [];
  }
}
