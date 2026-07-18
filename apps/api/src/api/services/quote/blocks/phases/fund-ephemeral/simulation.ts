import type { ChainBrand, PhaseCtx, PhaseIO, TokenBrand } from "../../core/types";

export async function simulateFundEphemeral<Token extends TokenBrand, Chain extends ChainBrand>(
  input: PhaseIO<Token, Chain>,
  ctx: PhaseCtx
): Promise<PhaseIO<Token, Chain>> {
  ctx.addNote(`FundEphemeral: funding ephemeral on ${input.chain} for ${input.amount.toFixed()} ${input.token}`);
  return input;
}
