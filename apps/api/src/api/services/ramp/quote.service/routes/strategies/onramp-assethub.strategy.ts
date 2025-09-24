import { OnRampFeeEngine } from "../../engines/fee/onramp";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInitializeEngine } from "../../engines/initialize/onramp";
import { OnRampSwapEngine } from "../../engines/nabla-swap/onramp";
import { OnRampSquidRouterToAssetHubEngine } from "../../engines/squidrouter/onramp-to-assethub";
import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../types";

export class OnRampAssethubStrategy implements IRouteStrategy {
  readonly name = "OnRampAssetHub";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [
      StageKey.OnRampInitialize,
      StageKey.OnRampSwap,
      StageKey.OnRampFee,
      StageKey.OnRampDiscount,
      StageKey.OnRampSquidRouter,
      StageKey.OnRampFinalize
    ];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.OnRampInitialize]: new OnRampInitializeEngine(),
      [StageKey.OnRampSwap]: new OnRampSwapEngine(),
      [StageKey.OnRampFee]: new OnRampFeeEngine(),
      [StageKey.OnRampDiscount]: new OnRampFeeEngine(),
      [StageKey.OnRampSquidRouter]: new OnRampSquidRouterToAssetHubEngine(),
      [StageKey.OnRampFinalize]: new OnRampFinalizeEngine()
    };
  }
}
