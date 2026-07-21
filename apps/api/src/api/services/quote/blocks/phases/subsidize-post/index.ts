import type { ChainBrand, Phase, PhaseIO, TokenBrand } from "../../core/types";
import { SubsidizePostSwapExecutor } from "./execution";
import { SubsidizePostContext, simulateSubsidizePost } from "./simulation";

export function SubsidizePost<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  typeof SubsidizePostContext,
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    context: SubsidizePostContext,
    executors: [new SubsidizePostSwapExecutor()],
    name: "SubsidizePost",
    phases: ["subsidizePostSwap"],
    simulate: simulateSubsidizePost
  };
}
