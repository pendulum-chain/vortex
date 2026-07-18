import type { ChainBrand, Phase, PhaseIO, TokenBrand } from "../../core/types";
import { SubsidizePreSwapExecutor } from "./execution";
import { simulateSubsidizePre } from "./simulation";

export type { SubsidyMeta } from "./simulation";
export { buildFullSubsidy, computeExpectedOutput } from "./simulation";

export function SubsidizePre<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    executors: [new SubsidizePreSwapExecutor()],
    name: "SubsidizePre",
    phases: ["subsidizePreSwap"],
    simulate: simulateSubsidizePre
  };
}
