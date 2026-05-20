import { StageKey } from "../../core/types";
import { OffRampDiscountEngine } from "../../engines/discount/offramp";
import { OffRampFeeStellarEngine } from "../../engines/fee/offramp-stellar";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";
import { OffRampFromAssethubInitializeEngine } from "../../engines/initialize/offramp-from-assethub";
import { OffRampFromEvmInitializeEngineMoonbeam } from "../../engines/initialize/offramp-from-evm";
import { OffRampSwapEngine } from "../../engines/nabla-swap/offramp";
import { OffRampToStellarPendulumTransferEngine } from "../../engines/pendulum-transfers/offramp-stellar";
import { defineRouteStrategy } from "../route-definition";

export const offrampToStellarStrategy = defineRouteStrategy({
  engines: ctx => ({
    [StageKey.Initialize]:
      ctx.request.from === "assethub"
        ? new OffRampFromAssethubInitializeEngine()
        : new OffRampFromEvmInitializeEngineMoonbeam(),
    [StageKey.NablaSwap]: new OffRampSwapEngine(),
    [StageKey.Fee]: new OffRampFeeStellarEngine(),
    [StageKey.Discount]: new OffRampDiscountEngine(),
    [StageKey.PendulumTransfer]: new OffRampToStellarPendulumTransferEngine(),
    [StageKey.Finalize]: new OffRampFinalizeEngine()
  }),
  name: "OffRampStellar",
  stages: [
    StageKey.Initialize,
    StageKey.NablaSwap,
    StageKey.Fee,
    StageKey.Discount,
    StageKey.PendulumTransfer,
    StageKey.Finalize
  ]
});
