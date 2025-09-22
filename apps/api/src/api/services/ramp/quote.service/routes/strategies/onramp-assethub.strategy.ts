import { IRouteStrategy, QuoteContext, StageKey } from "../../types";

// PR3: On-ramp to AssetHub strategy
// Enable core stages: InputPlanner -> Swap. The rest remains in legacy flow for parity.
export class OnRampAssethubStrategy implements IRouteStrategy {
  readonly name = "OnRampAssetHub";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [StageKey.InputPlanner, StageKey.Swap];
  }
}
