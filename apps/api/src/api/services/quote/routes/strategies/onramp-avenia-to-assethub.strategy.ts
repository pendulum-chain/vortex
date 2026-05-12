import { StageKey } from "../../core/types";
import { OnRampDiscountEngine } from "../../engines/discount/onramp";
import { OnRampAveniaToAssethubFeeEngine } from "../../engines/fee/onramp-brl-to-assethub";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampHydrationEngine } from "../../engines/hydration/onramp";
import { OnRampInitializeAveniaEngine } from "../../engines/initialize/onramp-avenia";
import { OnRampSwapEngine } from "../../engines/nabla-swap/onramp";
import { OnRampPendulumTransferEngine } from "../../engines/pendulum-transfers/onramp";
import { defineRouteStrategy, withHydrationForNonUsdc } from "../route-definition";

export const onrampAveniaToAssethubStrategy = defineRouteStrategy({
  engines: () => ({
    [StageKey.Initialize]: new OnRampInitializeAveniaEngine(),
    [StageKey.Fee]: new OnRampAveniaToAssethubFeeEngine(),
    [StageKey.NablaSwap]: new OnRampSwapEngine(),
    [StageKey.Discount]: new OnRampDiscountEngine(),
    [StageKey.PendulumTransfer]: new OnRampPendulumTransferEngine(),
    [StageKey.HydrationSwap]: new OnRampHydrationEngine(),
    [StageKey.Finalize]: new OnRampFinalizeEngine()
  }),
  name: "OnRampAveniaToAssetHub",
  stages: withHydrationForNonUsdc([
    StageKey.Initialize,
    StageKey.Fee,
    StageKey.NablaSwap,
    StageKey.Discount,
    StageKey.PendulumTransfer,
    StageKey.Finalize
  ])
});
