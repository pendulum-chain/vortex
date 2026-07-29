import type { ChainBrand, Phase, PhaseIO, TokenBrand } from "../../core/types";
import { FundEphemeralExecutor } from "./execution";
import { FundEphemeralContext, simulateFundEphemeral } from "./simulation";

export function FundEphemeral<Token extends TokenBrand, Chain extends ChainBrand>(
  _token: Token,
  _chain: Chain
): Phase<typeof FundEphemeralContext, PhaseIO<Token, Chain>, PhaseIO<Token, Chain>> {
  return {
    context: FundEphemeralContext,
    executors: [new FundEphemeralExecutor()],
    name: "FundEphemeral",
    phases: ["fundEphemeral"],
    simulate: simulateFundEphemeral
  };
}
