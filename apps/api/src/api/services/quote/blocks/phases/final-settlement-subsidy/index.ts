import type { ChainBrand, Phase, PhaseIO, TokenBrand } from "../../core/types";
import { FinalSettlementSubsidyExecutor } from "./execution";
import { simulateFinalSettlementSubsidy } from "./simulation";

export function FinalSettlementSubsidy<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    executors: [new FinalSettlementSubsidyExecutor()],
    name: "FinalSettlementSubsidy",
    phases: ["finalSettlementSubsidy"],
    simulate: simulateFinalSettlementSubsidy
  };
}
