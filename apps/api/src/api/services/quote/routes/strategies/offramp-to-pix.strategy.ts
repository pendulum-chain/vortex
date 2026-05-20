import { StageKey } from "../../core/types";
import { OffRampDiscountEngine } from "../../engines/discount/offramp";
import { OffRampFeeAveniaEngine } from "../../engines/fee/offramp-avenia";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";
import { OffRampFromAssethubInitializeEngine } from "../../engines/initialize/offramp-from-assethub";
import { OffRampFromEvmInitializeEngineMoonbeam } from "../../engines/initialize/offramp-from-evm";
import { OffRampSwapEngine } from "../../engines/nabla-swap/offramp";
import { OffRampToAveniaPendulumTransferEngine } from "../../engines/pendulum-transfers/offramp-avenia";
import { defineRouteStrategy } from "../route-definition";

export const offrampToPixStrategy = defineRouteStrategy({
  engines: ctx => ({
    [StageKey.Initialize]:
      ctx.request.from === "assethub"
        ? new OffRampFromAssethubInitializeEngine()
        : new OffRampFromEvmInitializeEngineMoonbeam(),
    [StageKey.NablaSwap]: new OffRampSwapEngine(),
    [StageKey.Fee]: new OffRampFeeAveniaEngine(),
    [StageKey.Discount]: new OffRampDiscountEngine(),
    [StageKey.PendulumTransfer]: new OffRampToAveniaPendulumTransferEngine(),
    [StageKey.Finalize]: new OffRampFinalizeEngine()
  }),
  name: "OffRampPix",
  stages: [
    StageKey.Initialize,
    StageKey.NablaSwap,
    StageKey.Fee,
    StageKey.Discount,
    StageKey.PendulumTransfer,
    StageKey.Finalize
  ]
});
