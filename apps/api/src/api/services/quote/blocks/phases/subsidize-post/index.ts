import type { ChainBrand, Phase, PhaseIO, TokenBrand } from "../../core/types";
import { SubsidizePostSwapExecutor } from "./execution";
import { simulateSubsidizePost } from "./simulation";

export function SubsidizePost<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    executors: [new SubsidizePostSwapExecutor()],
    name: "SubsidizePost",
    phases: ["subsidizePostSwap"],
    simulate: simulateSubsidizePost
  };
}
