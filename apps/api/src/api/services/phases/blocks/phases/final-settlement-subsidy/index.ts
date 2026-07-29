import type { ChainBrand, Phase, PhaseIO, TokenBrand } from "../../core/types";
import { FinalSettlementSubsidyExecutor } from "./execution";
import { FinalSettlementSubsidyContext, simulateFinalSettlementSubsidy } from "./simulation";

export function FinalSettlementSubsidy<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  typeof FinalSettlementSubsidyContext,
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    context: FinalSettlementSubsidyContext,
    executors: [new FinalSettlementSubsidyExecutor()],
    name: "FinalSettlementSubsidy",
    phases: ["finalSettlementSubsidy"],
    simulate: simulateFinalSettlementSubsidy
  };
}
