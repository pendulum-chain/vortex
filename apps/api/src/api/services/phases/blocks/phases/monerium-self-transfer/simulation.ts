import { defineContext, type SerializableBig } from "../../core/metadata";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";
import { isMoneriumIssueNetwork, MONERIUM_EURE, type MoneriumIssueNetwork } from "../monerium-issue/simulation";

export interface MoneriumSelfTransferMetadata {
  amount: SerializableBig;
  amountRaw: string;
  chain: MoneriumIssueNetwork;
  token: typeof MONERIUM_EURE;
}

export const MoneriumSelfTransferContext = defineContext<MoneriumSelfTransferMetadata>()("moneriumSelfTransfer");

export async function simulateMoneriumSelfTransfer<Network extends MoneriumIssueNetwork>(
  input: PhaseIO<typeof MONERIUM_EURE, Network>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<typeof MONERIUM_EURE, Network>, MoneriumSelfTransferMetadata>> {
  if (!isMoneriumIssueNetwork(input.chain) || input.token !== MONERIUM_EURE) {
    throw new Error("MoneriumSelfTransfer requires EURE on a supported Monerium issue network");
  }

  ctx.addNote(`MoneriumSelfTransfer: exact ${input.amount.toFixed()} EURE transfer on ${input.chain}`);
  return {
    metadata: { amount: input.amount, amountRaw: input.amountRaw, chain: input.chain, token: MONERIUM_EURE },
    output: input
  };
}
