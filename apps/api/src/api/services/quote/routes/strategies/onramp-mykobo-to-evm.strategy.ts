import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OnRampMykoboToEvmFeeEngine } from "../../engines/fee/onramp-mykobo-to-evm";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInitializeMykoboEngine } from "../../engines/initialize/onramp-mykobo";
import { OnRampSquidRouterMykoboBaseToEvmEngine } from "../../engines/squidrouter/onramp-mykobo-base-to-evm";

export class OnrampMykoboToEvmStrategy implements IRouteStrategy {
  readonly name = "OnRampMykoboToEvm";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [StageKey.Initialize, StageKey.Fee, StageKey.SquidRouter, StageKey.Finalize];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.Initialize]: new OnRampInitializeMykoboEngine(),
      [StageKey.Fee]: new OnRampMykoboToEvmFeeEngine(),
      [StageKey.SquidRouter]: new OnRampSquidRouterMykoboBaseToEvmEngine(),
      [StageKey.Finalize]: new OnRampFinalizeEngine()
    };
  }
}
