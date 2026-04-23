import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OffRampEvmToAlfredpayFeeEngine } from "../../engines/fee/offramp-evm-to-alfredpay";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";

import { AlfredpayOffRampFromEvmInitializeEngine } from "../../engines/initialize/offramp-from-evm-alfredpay";
import { OfframpTransactionAlfredpayEngine } from "../../engines/partners/offramp-alfredpay";

export class OfframpEvmToAlfredpayStrategy implements IRouteStrategy {
  readonly name = "OfframpEvmToAlfredpay";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [StageKey.Initialize, StageKey.PartnerOperation, StageKey.Fee, StageKey.Finalize];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.Initialize]: new AlfredpayOffRampFromEvmInitializeEngine(),
      [StageKey.Fee]: new OffRampEvmToAlfredpayFeeEngine(),
      [StageKey.PartnerOperation]: new OfframpTransactionAlfredpayEngine(),
      [StageKey.Finalize]: new OffRampFinalizeEngine()
    };
  }
}
