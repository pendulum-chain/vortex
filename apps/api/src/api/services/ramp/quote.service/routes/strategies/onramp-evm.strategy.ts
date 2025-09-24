import { FiatToken } from "@packages/shared";
import { OnRampBridgeToEvmEngine } from "../../engines/bridge/onramp-to-evm";
import { OnRampFeeEngine } from "../../engines/fee/onramp";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInputPlannerEngine } from "../../engines/input-planner/onramp";
import { SpecialOnrampEurEvmEngine } from "../../engines/special-onramp-eur-evm";
import { OnRampSwapEngine } from "../../engines/swap/onramp";
import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../types";

export class OnRampEvmStrategy implements IRouteStrategy {
  readonly name = "OnRampEvm";

  getStages(ctx: QuoteContext): StageKey[] {
    // EUR special-case handled by dedicated engine
    if (ctx.request.inputCurrency === FiatToken.EURC) {
      return [StageKey.SpecialOnrampEurEvm];
    }
    // Non-EUR on-ramp to EVM goes through the modular pipeline
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
      [StageKey.OnRampBridge]: new OnRampBridgeToEvmEngine(),
      [StageKey.OnRampFinalize]: new OnRampFinalizeEngine(),

      [StageKey.SpecialOnrampEurEvm]: new SpecialOnrampEurEvmEngine()
    };
  }
}
