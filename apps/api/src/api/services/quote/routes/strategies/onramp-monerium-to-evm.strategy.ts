import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OnRampMoneriumToEvmFeeEngine } from "../../engines/fee/onramp-monerium-to-evm";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInitializeMoneriumEngine } from "../../engines/initialize/onramp-monerium";
import { OnRampSquidRouterEurToEvmEngine } from "../../engines/squidrouter/onramp-polygon-to-evm";

export class OnrampMoneriumToEvmStrategy implements IRouteStrategy {
  readonly name = "OnRampEvm";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [StageKey.OnRampInitialize, StageKey.OnRampFee, StageKey.OnRampSquidRouter, StageKey.OnRampFinalize];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.OnRampInitialize]: new OnRampInitializeMoneriumEngine(),
      [StageKey.OnRampFee]: new OnRampMoneriumToEvmFeeEngine(),
      [StageKey.OnRampSquidRouter]: new OnRampSquidRouterEurToEvmEngine(),
      [StageKey.OnRampFinalize]: new OnRampFinalizeEngine()
    };
  }
}
