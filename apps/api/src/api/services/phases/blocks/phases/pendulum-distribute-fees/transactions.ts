import { EphemeralAccountType, Networks } from "@vortexfi/shared";
import type { QuoteTicketAttributes } from "../../../../../../models/quoteTicket.model";
import { requireAccount } from "../../core/accounts";
import { createSubstrateFeeDistributionTransaction } from "../../core/fee-distribution";
import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { DistributeFeesMetadata } from "../distribute-fees/simulation";

export async function preparePendulumDistributeFeesTxs(ctx: PrepareCtx<DistributeFeesMetadata>): Promise<PreparedPhaseTxs> {
  const substrate = requireAccount(ctx.accounts, EphemeralAccountType.Substrate);
  const txData = await createSubstrateFeeDistributionTransaction({
    ...ctx.quote,
    metadata: { fees: ctx.globals.fees, request: ctx.globals.request }
  } as QuoteTicketAttributes);
  return {
    intents: txData
      ? [{ lane: "main", network: Networks.Pendulum, phase: "distributeFees", signer: substrate.address, txData }]
      : []
  };
}
