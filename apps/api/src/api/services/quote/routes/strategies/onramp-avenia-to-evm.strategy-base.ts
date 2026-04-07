import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OnRampDiscountEngine } from "../../engines/discount/onramp";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInitializeAveniaEngine } from "../../engines/initialize/onramp-avenia";
import { OnRampSquidRouterBrlToEvmEngineBase } from "../../engines/squidrouter/onramp-base-to-evm";

export class OnrampAveniaToEvmStrategy implements IRouteStrategy {
  readonly name = "OnRampAveniaToEvm";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [StageKey.Initialize, StageKey.Fee, StageKey.NablaSwap, StageKey.Discount, StageKey.SquidRouter, StageKey.Finalize];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.Initialize]: new OnRampInitializeAveniaEngine(),
      [StageKey.NablaSwap]: new OnRampSquidRouterBrlToEvmEngineBase(),
      [StageKey.Discount]: new OnRampDiscountEngine(),
      [StageKey.Finalize]: new OnRampFinalizeEngine()
    };
  }
}
