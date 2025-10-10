import { FiatToken } from "@packages/shared";
import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OnRampDiscountEngine } from "../../engines/discount/onramp";
import { OnRampAveniaToAssethubFeeEngine } from "../../engines/fee/onramp-brl-to-assethub";
import { OnRampMoneriumToAssethubFeeEngine } from "../../engines/fee/onramp-monerium-to-assethub";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampHydrationEngine } from "../../engines/hydration/onramp";
import { OnRampInitializeAveniaEngine } from "../../engines/initialize/onramp-avenia";
import { OnRampInitializeMoneriumEngine } from "../../engines/initialize/onramp-monerium";
import { OnRampSwapEngine } from "../../engines/nabla-swap/onramp";
import { OnRampPendulumTransferEngine } from "../../engines/pendulum-transfers/onramp";
import { OnRampSquidRouterEurToAssetHubEngine } from "../../engines/squidrouter/onramp-polygon-to-moonbeam";

export class OnrampAveniaToAssethubStrategy implements IRouteStrategy {
  readonly name = "OnRampAveniaToAssetHub";

  getStages(ctx: QuoteContext): StageKey[] {
    if (ctx.request.outputCurrency === "USDC") {
      return [
        StageKey.Initialize,
        StageKey.Fee,
        StageKey.NablaSwap,
        StageKey.Discount,
        StageKey.PendulumTransfer,
        StageKey.Finalize
      ];
    } else {
      return [
        StageKey.Initialize,
        StageKey.Fee,
        StageKey.NablaSwap,
        StageKey.Discount,
        StageKey.PendulumTransfer,
        StageKey.HydrationSwap, // Add Hydration stage for non-USDC output
        StageKey.Finalize
      ];
    }
  }

  getEngines(ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.Initialize]: new OnRampInitializeAveniaEngine(),
      [StageKey.Fee]: new OnRampAveniaToAssethubFeeEngine(),
      [StageKey.NablaSwap]: new OnRampSwapEngine(),
      [StageKey.Discount]: new OnRampDiscountEngine(),
      [StageKey.PendulumTransfer]: new OnRampPendulumTransferEngine(),
      [StageKey.HydrationSwap]: new OnRampHydrationEngine(),
      [StageKey.Finalize]: new OnRampFinalizeEngine()
    };
  }
}
