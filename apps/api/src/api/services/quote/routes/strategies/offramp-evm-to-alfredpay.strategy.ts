import { Networks } from "@vortexfi/shared";
import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OffRampDiscountEngine } from "../../engines/discount/offramp";
import { OffRampFeeAveniaEngine } from "../../engines/fee/offramp-avenia";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";
import { OffRampFromEvmInitializeEngine } from "../../engines/initialize/offramp-from-evm-alfredpay";
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
      [StageKey.Initialize]: new OffRampFromEvmInitializeEngine(Networks.Base),
      [StageKey.Fee]: new OffRampFeeAveniaEngine(),
      [StageKey.NablaSwap]: new OffRampSwapEngine(),
      [StageKey.Discount]: new OffRampDiscountEngine(),
      [StageKey.PendulumTransfer]: new OffRampToAveniaPendulumTransferEngine(),
      [StageKey.Finalize]: new OffRampFinalizeEngine()
    };
  }
}
