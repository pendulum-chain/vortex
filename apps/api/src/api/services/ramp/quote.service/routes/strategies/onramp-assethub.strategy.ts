import { IRouteStrategy, QuoteContext, StageKey } from "../../types";

/**
 * PR4: On-ramp to AssetHub strategy
 * Enable stages: InputPlanner -> Swap -> Fee -> Discount.
 * Finalization/persistence remain in legacy flow for parity (PR5 will migrate).
 */
export class OnRampAssethubStrategy implements IRouteStrategy {
  readonly name = "OnRampAssetHub";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [StageKey.InputPlanner, StageKey.Swap, StageKey.Fee, StageKey.Discount, StageKey.Finalize];
  }
}
