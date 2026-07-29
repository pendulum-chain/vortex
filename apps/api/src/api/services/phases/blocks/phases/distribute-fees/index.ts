import type { ChainBrand, Phase, PhaseIO, TokenBrand } from "../../core/types";
import { DistributeFeesExecutor } from "./execution";
import { DistributeFeesContext, simulateDistributeFees } from "./simulation";
import { prepareDistributeFeesTxs } from "./transactions";

export function DistributeFees<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  typeof DistributeFeesContext,
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    context: DistributeFeesContext,
    executors: [new DistributeFeesExecutor()],
    name: "DistributeFees",
    phases: ["distributeFees"],
    prepareTxs: prepareDistributeFeesTxs,
    simulate: simulateDistributeFees
  };
}
