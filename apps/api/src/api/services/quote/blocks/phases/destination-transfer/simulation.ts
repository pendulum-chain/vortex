import type { ChainBrand, PhaseCtx, PhaseIO, TokenBrand } from "../../core/types";

export async function simulateDestinationTransfer<Token extends TokenBrand, Chain extends ChainBrand>(
  input: PhaseIO<Token, Chain>,
  ctx: PhaseCtx
): Promise<PhaseIO<Token, Chain>> {
  ctx.addNote(`DestinationTransfer: delivering ${input.amount.toFixed()} ${input.token} on ${input.chain} to the user`);
  return input;
}
