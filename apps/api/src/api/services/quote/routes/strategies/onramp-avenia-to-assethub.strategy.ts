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
import { OnRampPendulumTransferEngine } from "../../engines/pendulum/onramp";
import { OnRampSquidRouterEurToAssetHubEngine } from "../../engines/squidrouter/onramp-polygon-to-moonbeam";

export class OnrampAveniaToAssethubStrategy implements IRouteStrategy {
  readonly name = "OnRampAssetHub";

  getStages(ctx: QuoteContext): StageKey[] {
    if (ctx.request.outputCurrency === "USDC") {
      return [
        StageKey.OnRampInitialize,
        StageKey.OnRampFee,
        StageKey.OnRampNablaSwap,
        StageKey.OnRampDiscount,
        StageKey.OnRampPendulumTransfer,
        StageKey.OnRampFinalize
      ];
    } else {
      return [
        StageKey.OnRampInitialize,
        StageKey.OnRampFee,
        StageKey.OnRampNablaSwap,
        StageKey.OnRampDiscount,
        StageKey.OnRampPendulumTransfer,
        StageKey.OnRampHydration, // Add Hydration stage for non-USDC output
        StageKey.OnRampFinalize
      ];
    }
  }

  getEngines(ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.OnRampInitialize]: new OnRampInitializeAveniaEngine(),
      [StageKey.OnRampFee]: new OnRampAveniaToAssethubFeeEngine(),
      [StageKey.OnRampNablaSwap]: new OnRampSwapEngine(),
      [StageKey.OnRampDiscount]: new OnRampDiscountEngine(),
      [StageKey.OnRampPendulumTransfer]: new OnRampPendulumTransferEngine(),
      [StageKey.OnRampHydration]: new OnRampHydrationEngine(),
      [StageKey.OnRampFinalize]: new OnRampFinalizeEngine()
    };
  }
}
