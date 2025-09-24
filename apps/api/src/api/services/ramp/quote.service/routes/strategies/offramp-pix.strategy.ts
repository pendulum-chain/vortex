import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OffRampDiscountEngine } from "../../engines/discount/offramp";
import { OffRampFeeEngine } from "../../engines/fee/offramp";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";
import { OffRampInitializeEngine } from "../../engines/initialize/offramp";
import { OffRampSwapEngine } from "../../engines/nabla-swap/offramp";

export class OffRampPixStrategy implements IRouteStrategy {
  readonly name = "OffRampPix";

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
