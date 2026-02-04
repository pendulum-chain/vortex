import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OnRampAlfredpayToEvmFeeEngine } from "../../engines/fee/onramp-alfredpay-to-evm";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInitializeAlfredpayEngine } from "../../engines/initialize/onramp-alfredpay";
import { OnRampSquidRouterEurToEvmEngine } from "../../engines/squidrouter/onramp-polygon-to-evm";

export class OnrampAlfredpayToEvmStrategy implements IRouteStrategy {
  readonly name = "OnrampAlfredpayToEvm";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [StageKey.Initialize, StageKey.Fee, StageKey.SquidRouter, StageKey.Finalize];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.Initialize]: new OnRampInitializeAlfredpayEngine(),
      [StageKey.Fee]: new OnRampAlfredpayToEvmFeeEngine(),
      [StageKey.SquidRouter]: new OnRampSquidRouterEurToEvmEngine(), // Uses same engine as monerium's. (Polygon ephemeral -> destination)
      [StageKey.Finalize]: new OnRampFinalizeEngine()
    };
  }
}
