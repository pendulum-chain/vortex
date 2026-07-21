import type { ChainBrand, Phase, PhaseIO, TokenBrand } from "../../core/types";
import { SubsidizePreSwapExecutor } from "./execution";
import { SubsidizePreContext, simulateAlfredpaySubsidizePre, simulateSubsidizePre } from "./simulation";

export type { SubsidyMetadata as SubsidyMeta } from "./simulation";
export { buildFullSubsidy, computeExpectedOutput } from "./simulation";

export function SubsidizePre<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  typeof SubsidizePreContext,
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    context: SubsidizePreContext,
    executors: [new SubsidizePreSwapExecutor()],
    name: "SubsidizePre",
    phases: ["subsidizePreSwap"],
    simulate: simulateSubsidizePre
  };
}

export function AlfredpaySubsidizePre<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  typeof SubsidizePreContext,
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    context: SubsidizePreContext,
    executors: [new SubsidizePreSwapExecutor()],
    name: "AlfredpaySubsidizePre",
    phases: ["subsidizePreSwap"],
    simulate: simulateAlfredpaySubsidizePre
  };
}
