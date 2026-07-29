import { defineContext } from "../../core/metadata";
import type { ChainBrand, PhaseCtx, PhaseIO, PhaseResult, TokenBrand } from "../../core/types";

export interface FundEphemeralMetadata {
  network: string;
  token: string;
}

export const FundEphemeralContext = defineContext<FundEphemeralMetadata>()("fundEphemeral");

export async function simulateFundEphemeral<Token extends TokenBrand, Chain extends ChainBrand>(
  input: PhaseIO<Token, Chain>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<Token, Chain>, FundEphemeralMetadata>> {
  ctx.addNote(`FundEphemeral: funding ephemeral on ${input.chain} for ${input.amount.toFixed()} ${input.token}`);
  return { metadata: { network: input.chain, token: input.token }, output: input };
}
