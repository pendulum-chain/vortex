import { EvmToken } from "@vortexfi/shared";
import { StageKey } from "../../core/types";
import { OffRampDiscountEngine } from "../../engines/discount/offramp";
import { OffRampFeeAveniaEngine } from "../../engines/fee/offramp-avenia";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";
import { OffRampFromEvmInitializeAveniaEngine } from "../../engines/initialize/offramp-from-evm-avenia";
import { OffRampMergeSubsidyEvmEngine } from "../../engines/merge-subsidy/offramp-evm";
import { OffRampSwapEngineEvm } from "../../engines/nabla-swap/offramp-evm";
import { defineRouteStrategy } from "../route-definition";

export const offrampToPixEvmStrategy = defineRouteStrategy({
  engines: () => ({
    [StageKey.Initialize]: new OffRampFromEvmInitializeAveniaEngine(),
    [StageKey.NablaSwap]: new OffRampSwapEngineEvm(EvmToken.BRLA),
    [StageKey.Fee]: new OffRampFeeAveniaEngine(),
    [StageKey.Discount]: new OffRampDiscountEngine(),
    [StageKey.MergeSubsidy]: new OffRampMergeSubsidyEvmEngine(),
    [StageKey.Finalize]: new OffRampFinalizeEngine()
  }),
  name: "OfframpToPixEvm",
  stages: [StageKey.Initialize, StageKey.NablaSwap, StageKey.Fee, StageKey.Discount, StageKey.MergeSubsidy, StageKey.Finalize]
});
