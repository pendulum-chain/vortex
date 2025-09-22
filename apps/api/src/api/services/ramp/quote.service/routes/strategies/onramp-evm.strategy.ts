// PR1 scaffolding: On-ramp to EVM strategy
// Returns an empty stage list for PR1 (no runtime behavior change).
// Later PRs will return the ordered pipeline: Validate -> InputPlanner -> Swap -> Bridge -> Fee -> Discount -> Finalize -> Persist

import { IRouteStrategy, QuoteContext, StageKey } from "../../types";

export class OnRampEvmStrategy implements IRouteStrategy {
  readonly name = "OnRampEvm";

  getStages(_ctx: QuoteContext): StageKey[] {
    // PR1: no-op to avoid behavior changes. Will be populated in PR2+.
    return [];
  }
}
