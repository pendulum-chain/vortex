import { defineContext, type SerializableBig } from "../../core/metadata";
import type { ChainBrand, PhaseCtx, PhaseIO, PhaseResult, TokenBrand } from "../../core/types";

export interface DestinationTransferMetadata {
  amountDecimal: SerializableBig;
  amountRaw: string;
  network: string;
  token: string;
}

export const DestinationTransferContext = defineContext<DestinationTransferMetadata>()("destinationTransfer");

export async function simulateDestinationTransfer<Token extends TokenBrand, Chain extends ChainBrand>(
  input: PhaseIO<Token, Chain>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<Token, Chain>, DestinationTransferMetadata>> {
  ctx.addNote(`DestinationTransfer: delivering ${input.amount.toFixed()} ${input.token} on ${input.chain} to the user`);
  return {
    metadata: { amountDecimal: input.amount, amountRaw: input.amountRaw, network: input.chain, token: input.token },
    output: input
  };
}
