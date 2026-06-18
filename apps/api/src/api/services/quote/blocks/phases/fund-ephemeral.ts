import type { ChainBrand, Phase, PhaseCtx, PhaseIO, TokenBrand } from "../core/types";

export function FundEphemeral<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    name: "FundEphemeral",
    phases: ["fundEphemeral"],
    async simulate(input: PhaseIO<Token, Chain>, ctx: PhaseCtx): Promise<PhaseIO<Token, Chain>> {
      ctx.addNote(`FundEphemeral: funding ephemeral on ${input.chain} for ${input.amount.toFixed()} ${input.token}`);
      return input;
    }
  };
}
