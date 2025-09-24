import { OffRampDiscountEngine } from "../../engines/discount/offramp";
import { OffRampFeeEngine } from "../../engines/fee/offramp";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";
import { OffRampInputPlannerEngine } from "../../engines/input-planner/offramp";
import { OffRampSwapEngine } from "../../engines/swap/offramp";
import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../types";

export class OffRampCbuStrategy implements IRouteStrategy {
  readonly name = "OffRampCbu";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [
      StageKey.OffRampInputPlanner,
      StageKey.OffRampSwap,
      StageKey.OffRampFee,
      StageKey.OffRampDiscount,
      StageKey.OffRampFinalize
    ];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.OffRampInputPlanner]: new OffRampInputPlannerEngine(),
      [StageKey.OffRampSwap]: new OffRampSwapEngine(),
      [StageKey.OffRampFee]: new OffRampFeeEngine(),
      [StageKey.OffRampDiscount]: new OffRampDiscountEngine(),
      [StageKey.OffRampFinalize]: new OffRampFinalizeEngine()
    };
  }
}
