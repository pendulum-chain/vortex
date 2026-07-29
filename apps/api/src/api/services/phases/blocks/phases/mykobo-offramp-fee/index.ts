import type { ChainBrand, Phase, PhaseIO, TokenBrand } from "../../core/types";
import { MykoboOfframpFeeContext, simulateMykoboOfframpFee } from "./simulation";

export function MykoboOfframpFee<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  typeof MykoboOfframpFeeContext,
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    context: MykoboOfframpFeeContext,
    name: "MykoboOfframpFee",
    phases: [],
    simulate: simulateMykoboOfframpFee
  };
}
