import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OnRampMoneriumToEvmFeeEngine } from "../../engines/fee/onramp-monerium-to-evm";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInitializeMoneriumEngine } from "../../engines/initialize/onramp-monerium";
import { OnRampSquidRouterEurToEvmEngine } from "../../engines/squidrouter/onramp-polygon-to-evm";

export class OnrampMoneriumToEvmStrategy implements IRouteStrategy {
  readonly name = "OnRampEvm";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [StageKey.Initialize, StageKey.Fee, StageKey.SquidRouter, StageKey.Finalize];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.Initialize]: new OnRampInitializeMoneriumEngine(),
      [StageKey.Fee]: new OnRampMoneriumToEvmFeeEngine(),
      [StageKey.SquidRouter]: new OnRampSquidRouterEurToEvmEngine(),
      [StageKey.Finalize]: new OnRampFinalizeEngine()
    };
  }
}
