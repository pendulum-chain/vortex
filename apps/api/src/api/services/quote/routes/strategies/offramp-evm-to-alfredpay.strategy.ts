import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OffRampEvmToAlfredpayFeeEngine } from "../../engines/fee/offramp-evm-to-alfredpay";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OffRampInitializeAlfredpayEngine } from "../../engines/initialize/offramp-alfredpay";
import { OnRampSquidRouterEvmToPolygonEngine } from "../../engines/squidrouter/onramp-evm-to-polygon";

export class OfframpEvmToAlfredpayStrategy implements IRouteStrategy {
  readonly name = "OfframpEvmToAlfredpay";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [StageKey.Initialize, StageKey.Fee, StageKey.SquidRouter, StageKey.Finalize];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.Initialize]: new OffRampInitializeAlfredpayEngine(),
      [StageKey.Fee]: new OffRampEvmToAlfredpayFeeEngine(),
      [StageKey.SquidRouter]: new OnRampSquidRouterEvmToPolygonEngine(),
      [StageKey.Finalize]: new OnRampFinalizeEngine()
    };
  }
}
