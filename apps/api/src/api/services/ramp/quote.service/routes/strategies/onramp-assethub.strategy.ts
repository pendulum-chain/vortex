import { IRouteStrategy, QuoteContext, StageKey } from "../../types";

/**
 * Enable stages: InputPlanner -> Swap -> Fee -> Discount.
 * Finalization/persistence remain in legacy flow for parity ( will migrate).
 */
export class OnRampAssethubStrategy implements IRouteStrategy {
  readonly name = "OnRampAssetHub";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [
      StageKey.OnRampInputPlanner,
      StageKey.OnRampSwap,
      StageKey.OnRampFee,
      StageKey.OnRampDiscount,
      StageKey.OnRampFinalize
    ];
  }
}
