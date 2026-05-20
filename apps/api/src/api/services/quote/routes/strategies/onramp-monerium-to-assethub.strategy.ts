import { StageKey } from "../../core/types";
import { OnRampDiscountEngine } from "../../engines/discount/onramp";
import { OnRampMoneriumToAssethubFeeEngine } from "../../engines/fee/onramp-monerium-to-assethub";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampHydrationEngine } from "../../engines/hydration/onramp";
import { OnRampInitializeMoneriumEngine } from "../../engines/initialize/onramp-monerium";
import { OnRampSwapEngine } from "../../engines/nabla-swap/onramp";
import { OnRampPendulumTransferEngine } from "../../engines/pendulum-transfers/onramp";
import { OnRampSquidRouterEurToAssetHubEngine } from "../../engines/squidrouter/onramp-polygon-to-moonbeam";
import { defineRouteStrategy, withHydrationForNonUsdc } from "../route-definition";

export const onrampMoneriumToAssethubStrategy = defineRouteStrategy({
  engines: () => ({
    [StageKey.Initialize]: new OnRampInitializeMoneriumEngine(),
    [StageKey.SquidRouter]: new OnRampSquidRouterEurToAssetHubEngine(),
    [StageKey.Fee]: new OnRampMoneriumToAssethubFeeEngine(),
    [StageKey.NablaSwap]: new OnRampSwapEngine(),
    [StageKey.Discount]: new OnRampDiscountEngine(),
    [StageKey.PendulumTransfer]: new OnRampPendulumTransferEngine(),
    [StageKey.HydrationSwap]: new OnRampHydrationEngine(),
    [StageKey.Finalize]: new OnRampFinalizeEngine()
  }),
  name: "OnRampMoneriumToAssetHub",
  stages: withHydrationForNonUsdc([
    StageKey.Initialize,
    StageKey.SquidRouter,
    StageKey.Fee,
    StageKey.NablaSwap,
    StageKey.Discount,
    StageKey.PendulumTransfer,
    StageKey.Finalize
  ])
});
