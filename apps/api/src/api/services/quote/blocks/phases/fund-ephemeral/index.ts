import type { EvmNetworks } from "@vortexfi/shared";
import type { ChainBrand, Phase, PhaseIO, TokenBrand } from "../../core/types";
import { FundEphemeralExecutor } from "./execution";
import { simulateFundEphemeral } from "./simulation";

export function FundEphemeral<Token extends TokenBrand, Chain extends ChainBrand>(
  _token: Token,
  chain: Chain
): Phase<PhaseIO<Token, Chain>, PhaseIO<Token, Chain>> {
  return {
    executors: [new FundEphemeralExecutor(chain as EvmNetworks)],
    name: "FundEphemeral",
    phases: ["fundEphemeral"],
    simulate: simulateFundEphemeral
  };
}
