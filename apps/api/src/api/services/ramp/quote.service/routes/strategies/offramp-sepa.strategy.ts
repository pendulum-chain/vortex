import { OffRampDiscountEngine } from "../../engines/discount/offramp";
import { OffRampFeeEngine } from "../../engines/fee/offramp";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";
import { OffRampInitializeEngine } from "../../engines/initialize/offramp";
import { OffRampSwapEngine } from "../../engines/nabla-swap/offramp";
import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../types";

export class OffRampSepaStrategy implements IRouteStrategy {
  readonly name = "OffRampSepa";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [
      StageKey.OffRampInitialize,
      StageKey.OffRampSwap,
      StageKey.OffRampFee,
      StageKey.OffRampDiscount,
      StageKey.OffRampFinalize
    ];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.OffRampInitialize]: new OffRampInitializeEngine(),
      [StageKey.OffRampSwap]: new OffRampSwapEngine(),
      [StageKey.OffRampFee]: new OffRampFeeEngine(),
      [StageKey.OffRampDiscount]: new OffRampDiscountEngine(),
      [StageKey.OffRampFinalize]: new OffRampFinalizeEngine()
    };
  }
}
