import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OffRampDiscountEngine } from "../../engines/discount/offramp";
import { OffRampFeeEngine } from "../../engines/fee/offramp";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";
import { OffRampFromAssethubInitializeEngine } from "../../engines/initialize/offramp-from-assethub";
import { OffRampFromEvmInitializeEngine } from "../../engines/initialize/offramp-from-evm";
import { OffRampSwapEngine } from "../../engines/nabla-swap/offramp";
import { OffRampToStellarPendulumTransferEngine } from "../../engines/pendulum-transfers/offramp-stellar";

export class OfframpToStellarStrategy implements IRouteStrategy {
  readonly name = "OffRampStellar";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [
      StageKey.OffRampInitialize,
      StageKey.OffRampSwap,
      StageKey.OffRampFee,
      StageKey.OffRampDiscount,
      StageKey.OffRampPendulumTransfer,
      StageKey.OffRampFinalize
    ];
  }

  getEngines(ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.OffRampInitialize]:
        ctx.request.from === "assethub" ? new OffRampFromAssethubInitializeEngine() : new OffRampFromEvmInitializeEngine(),
      [StageKey.OffRampSwap]: new OffRampSwapEngine(),
      [StageKey.OffRampFee]: new OffRampFeeEngine(),
      [StageKey.OffRampDiscount]: new OffRampDiscountEngine(),
      [StageKey.OffRampPendulumTransfer]: new OffRampToStellarPendulumTransferEngine(),
      [StageKey.OffRampFinalize]: new OffRampFinalizeEngine()
    };
  }
}
