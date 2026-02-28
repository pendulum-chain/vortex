import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OffRampEvmToAlfredpayFeeEngine } from "../../engines/fee/offramp-evm-to-alfredpay";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";
import { OfframpTransactionAlfredpayEngine } from "../../engines/initialize/offramp-alfredpay";
import { AlfredpayOffRampFromEvmInitializeEngine } from "../../engines/initialize/offramp-from-evm-alfredpay";

export class OfframpEvmToAlfredpayStrategy implements IRouteStrategy {
  readonly name = "OfframpEvmToAlfredpay";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [StageKey.Initialize, StageKey.Fee, StageKey.SquidRouter, StageKey.Finalize];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.Initialize]: new AlfredpayOffRampFromEvmInitializeEngine(),
      [StageKey.Fee]: new OffRampEvmToAlfredpayFeeEngine(),
      [StageKey.SquidRouter]: new OfframpTransactionAlfredpayEngine(), // TODO: not really squidrouter for phase key, it handles the alfredpay ofrramp quote. We need a new phase name.
      [StageKey.Finalize]: new OffRampFinalizeEngine()
    };
  }
}
