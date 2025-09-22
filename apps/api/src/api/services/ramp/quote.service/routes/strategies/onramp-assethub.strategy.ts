// PR1 scaffolding: On-ramp to AssetHub strategy
// Returns an empty stage list for PR1 (no runtime behavior change).
// Later PRs will return the ordered pipeline: Validate -> InputPlanner -> Swap -> Fee -> Discount -> Finalize -> Persist

import { IRouteStrategy, QuoteContext, StageKey } from "../../types";

export class OnRampAssethubStrategy implements IRouteStrategy {
  readonly name = "OnRampAssetHub";

  getStages(_ctx: QuoteContext): StageKey[] {
    // PR1: no-op to avoid behavior changes. Will be populated in PR2+.
    return [];
  }
}
