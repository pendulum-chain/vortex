import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OffRampDiscountEngine } from "../../engines/discount/offramp";
import { OffRampFeeEngine } from "../../engines/fee/offramp";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";
import { OffRampFromAssethubInitializeEngine } from "../../engines/initialize/offramp-from-assethub";
import { OffRampFromEvmInitializeEngine } from "../../engines/initialize/offramp-from-evm";
import { OffRampSwapEngine } from "../../engines/nabla-swap/offramp";
import { OffRampToAveniaPendulumTransferEngine } from "../../engines/pendulum-transfers/offramp-avenia";

export class OfframpToPixStrategy implements IRouteStrategy {
  readonly name = "OffRampPix";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [
      StageKey.Initialize,
      StageKey.NablaSwap,
      StageKey.Fee,
      StageKey.Discount,
      StageKey.PendulumTransfer,
      StageKey.Finalize
    ];
  }

  getEngines(ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.Initialize]:
        ctx.request.from === "assethub" ? new OffRampFromAssethubInitializeEngine() : new OffRampFromEvmInitializeEngine(),
      [StageKey.Fee]: new OffRampFeeEngine(),
      [StageKey.NablaSwap]: new OffRampSwapEngine(),
      [StageKey.Discount]: new OffRampDiscountEngine(),
      [StageKey.PendulumTransfer]: new OffRampToAveniaPendulumTransferEngine(),
      [StageKey.Finalize]: new OffRampFinalizeEngine()
    };
  }
}
