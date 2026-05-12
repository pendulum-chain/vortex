import { EvmToken, Networks } from "@vortexfi/shared";
import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OffRampDiscountEngine } from "../../engines/discount/offramp";
import { OffRampFeeAveniaEngine } from "../../engines/fee/offramp-avenia";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";
import { OffRampFromEvmInitializeEngine } from "../../engines/initialize/offramp-from-evm-alfredpay";
import { OffRampMergeSubsidyEvmEngine } from "../../engines/merge-subsidy/offramp-evm";
import { OffRampSwapEngineEvm } from "../../engines/nabla-swap/offramp-evm";

export class OfframpToPixEvmStrategy implements IRouteStrategy {
  readonly name = "OfframpToPixEvm";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [StageKey.Initialize, StageKey.NablaSwap, StageKey.Fee, StageKey.Discount, StageKey.MergeSubsidy, StageKey.Finalize];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.Initialize]: new OffRampFromEvmInitializeEngine(Networks.Base),
      [StageKey.NablaSwap]: new OffRampSwapEngineEvm(EvmToken.BRLA),
      [StageKey.Fee]: new OffRampFeeAveniaEngine(),
      [StageKey.Discount]: new OffRampDiscountEngine(),
      [StageKey.MergeSubsidy]: new OffRampMergeSubsidyEvmEngine(),
      [StageKey.Finalize]: new OffRampFinalizeEngine()
    };
  }
}
