import { AccountMeta, OnChainTokenDetails, PendulumTokenDetails, UnsignedTx } from "@packages/shared";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import { addFeeDistributionTransaction, createNablaSwapTransactions } from "../common/transactions";

export async function createPendulumSwapAndSubsidizeTransactions(
  quote: QuoteTicketAttributes,
  pendulumEphemeralEntry: AccountMeta,
  outputTokenDetails: OnChainTokenDetails,
  inputTokenPendulumDetails: PendulumTokenDetails,
  outputTokenPendulumDetails: PendulumTokenDetails,
  unsignedTxs: UnsignedTx[]
) {
  let pendulumNonce = 0;
  const { nextNonce: nonceAfterNabla, stateMeta: nablaStateMeta } = await createNablaSwapTransactions(
    {
      account: pendulumEphemeralEntry,
      inputTokenPendulumDetails,
      outputTokenPendulumDetails,
      quote
    },
    unsignedTxs,
    pendulumNonce
  );
  pendulumNonce = nonceAfterNabla;

  pendulumNonce = await addFeeDistributionTransaction(quote, pendulumEphemeralEntry, unsignedTxs, pendulumNonce);

  return { nablaStateMeta, pendulumNonce };
}
