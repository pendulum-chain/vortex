import { OnRampBridgeToAssetHubEngine } from "../../engines/bridge/onramp-to-assethub";
import { OnRampFeeEngine } from "../../engines/fee/onramp";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInputPlannerEngine } from "../../engines/input-planner/onramp";
import { OnRampSwapEngine } from "../../engines/swap/onramp";
import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../types";

export class OnRampAssethubStrategy implements IRouteStrategy {
  readonly name = "OnRampAssetHub";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [
      StageKey.OnRampInputPlanner,
      StageKey.OnRampSwap,
      StageKey.OnRampFee,
      StageKey.OnRampDiscount,
      StageKey.OnRampBridge,
      StageKey.OnRampFinalize
    ];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.OnRampInputPlanner]: new OnRampInputPlannerEngine(),
      [StageKey.OnRampSwap]: new OnRampSwapEngine(),
      [StageKey.OnRampFee]: new OnRampFeeEngine(),
      [StageKey.OnRampDiscount]: new OnRampFeeEngine(),
      [StageKey.OnRampBridge]: new OnRampBridgeToAssetHubEngine(),
      [StageKey.OnRampFinalize]: new OnRampFinalizeEngine()
    };
  }
}
