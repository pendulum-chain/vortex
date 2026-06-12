import { EvmToken } from "@vortexfi/shared";
import { StageKey } from "../../core/types";
import { OffRampDiscountEngine } from "../../engines/discount/offramp";
import { OffRampFeeMykoboEngine } from "../../engines/fee/offramp-mykobo";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";
import { OffRampFromEvmInitializeMorphoEngine } from "../../engines/initialize/offramp-from-evm-morpho";
import { OffRampMergeSubsidyEvmEngine } from "../../engines/merge-subsidy/offramp-evm";
import { OffRampSwapEngineEvm } from "../../engines/nabla-swap/offramp-evm";
import { defineRouteStrategy } from "../route-definition";

/**
 * EUR offramp from Morpho vault shares on Ethereum → SEPA via Mykobo.
 *
 * The Initialize engine differs from the standard EUR offramp: it must first convert
 * share amount → USDC amount via the vault's previewRedeem, then request the
 * SquidRouter bridge quote (USDC Ethereum → USDC Base). Downstream stages
 * (NablaSwap, Fee, Discount, MergeSubsidy, Finalize) are unchanged.
 */
export const offrampToSepaEvmMorphoStrategy = defineRouteStrategy({
  engines: () => ({
    [StageKey.Initialize]: new OffRampFromEvmInitializeMorphoEngine(),
    [StageKey.NablaSwap]: new OffRampSwapEngineEvm(EvmToken.EURC),
    [StageKey.Fee]: new OffRampFeeMykoboEngine(),
    [StageKey.Discount]: new OffRampDiscountEngine(),
    [StageKey.MergeSubsidy]: new OffRampMergeSubsidyEvmEngine(),
    [StageKey.Finalize]: new OffRampFinalizeEngine()
  }),
  name: "OfframpToSepaEvmMorpho",
  stages: [StageKey.Initialize, StageKey.NablaSwap, StageKey.Fee, StageKey.Discount, StageKey.MergeSubsidy, StageKey.Finalize]
});
