import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OnRampDiscountEngine } from "../../engines/discount/onramp";
import { OnRampFeeEngine } from "../../engines/fee/onramp";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInitializeEngine } from "../../engines/initialize/onramp";
import { OnRampSwapEngine } from "../../engines/nabla-swap/onramp";
import { OnRampSquidRouterEurToAssetHubEngine } from "../../engines/squidrouter/onramp-eur-to-assethub";

export class OnRampAssethubStrategy implements IRouteStrategy {
  readonly name = "OnRampAssetHub";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [
      StageKey.OnRampInitialize,
      StageKey.OnRampFee,
      StageKey.OnRampSquidRouter,
      StageKey.OnRampSwap,
      StageKey.OnRampDiscount,
      StageKey.OnRampFinalize
    ];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.OnRampInitialize]: new OnRampInitializeEngine(),
      [StageKey.OnRampFee]: new OnRampFeeEngine(),
      [StageKey.OnRampSquidRouter]: new OnRampSquidRouterEurToAssetHubEngine(),
      [StageKey.OnRampSwap]: new OnRampSwapEngine(),
      [StageKey.OnRampDiscount]: new OnRampDiscountEngine(),
      [StageKey.OnRampFinalize]: new OnRampFinalizeEngine()
    };
  }
}
