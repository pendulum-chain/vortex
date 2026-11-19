import type { Networks } from "@vortexfi/shared";
import type { GOLD_TOKEN } from "../../core/gold-base";
import type { Phase, PhaseIO } from "../../core/types";
import { GoldSettlementExecutor } from "./execution";
import { GoldSettlementContext, simulateGoldSettlement } from "./simulation";

type BasePaxg = PhaseIO<typeof GOLD_TOKEN, typeof Networks.Base>;

export function GoldSettlement(): Phase<typeof GoldSettlementContext, BasePaxg, BasePaxg> {
  return {
    context: GoldSettlementContext,
    executors: [new GoldSettlementExecutor()],
    name: "GoldSettlement",
    phases: ["goldSettlementTopUp"],
    simulate: simulateGoldSettlement
  };
}
