import { EvmToken, Networks } from "@vortexfi/shared";
import { StageKey } from "../../core/types";
import { OffRampDiscountEngine } from "../../engines/discount/offramp";
import { OffRampFeeMykoboEngine } from "../../engines/fee/offramp-mykobo";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";
import { OffRampFromEvmInitializeEngine } from "../../engines/initialize/offramp-from-evm-alfredpay";
import { OffRampMergeSubsidyEvmEngine } from "../../engines/merge-subsidy/offramp-evm";
import { OffRampSwapEngineEvm } from "../../engines/nabla-swap/offramp-evm";
import { defineRouteStrategy } from "../route-definition";

export const offrampToSepaEvmStrategy = defineRouteStrategy({
  engines: () => ({
    [StageKey.Initialize]: new OffRampFromEvmInitializeEngine(Networks.Base),
    [StageKey.NablaSwap]: new OffRampSwapEngineEvm(EvmToken.EURC),
    [StageKey.Fee]: new OffRampFeeMykoboEngine(),
    [StageKey.Discount]: new OffRampDiscountEngine(),
    [StageKey.MergeSubsidy]: new OffRampMergeSubsidyEvmEngine(),
    [StageKey.Finalize]: new OffRampFinalizeEngine()
  }),
  name: "OfframpToSepaEvm",
  stages: [StageKey.Initialize, StageKey.NablaSwap, StageKey.Fee, StageKey.Discount, StageKey.MergeSubsidy, StageKey.Finalize]
});
