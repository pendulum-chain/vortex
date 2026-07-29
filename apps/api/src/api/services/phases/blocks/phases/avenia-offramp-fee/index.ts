import type { ChainBrand, Phase, PhaseIO, TokenBrand } from "../../core/types";
import { AveniaOfframpFeeContext, simulateAveniaOfframpFee } from "./simulation";

export function AveniaOfframpFee<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  typeof AveniaOfframpFeeContext,
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    context: AveniaOfframpFeeContext,
    name: "AveniaOfframpFee",
    phases: [],
    simulate: simulateAveniaOfframpFee
  };
}
