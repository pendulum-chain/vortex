import { EvmToken, Networks } from "@vortexfi/shared";
import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OffRampDiscountEngine } from "../../engines/discount/offramp";
import { OffRampFeeAveniaEngine } from "../../engines/fee/offramp-avenia";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";
import { OffRampFromEvmInitializeEngine } from "../../engines/initialize/offramp-from-evm-alfredpay";
import { OffRampSwapEngineEvm } from "../../engines/nabla-swap/offramp-evm";

export class OfframpEvmToAlfredpayStrategy implements IRouteStrategy {
  readonly name = "OfframpEvmToAlfredpay";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [StageKey.Initialize, StageKey.Fee, StageKey.PartnerOperation, StageKey.Finalize];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.Initialize]: new OffRampFromEvmInitializeEngine(Networks.Polygon),
      [StageKey.Fee]: new OffRampFeeAveniaEngine(),
      [StageKey.NablaSwap]: new OffRampSwapEngineEvm(EvmToken.BRLA),
      [StageKey.Discount]: new OffRampDiscountEngine(),
      [StageKey.Finalize]: new OffRampFinalizeEngine()
    };
  }
}
