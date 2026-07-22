import type { AccountMeta } from "@vortexfi/shared";
import type QuoteTicket from "../../../../../models/quoteTicket.model";
import { resolveBlockFlow } from "../flows/catalog";
import { accountCapabilities } from "./accounts";
import { getFlowMetadata } from "./metadata";
import type { PreparedFlowTxs } from "./types";

interface PrepareBlockFlowTransactionsArgs {
  destinationAddress: string;
  quote: QuoteTicket;
  signingAccounts: AccountMeta[];
  taxId?: string;
  userId?: string;
}

export function assertBlockFlowMapped(quote: QuoteTicket): void {
  resolveBlockFlow(getFlowMetadata(quote.metadata).globals.request);
}

export async function prepareBlockFlowTransactions({
  destinationAddress,
  quote,
  signingAccounts,
  taxId,
  userId
}: PrepareBlockFlowTransactionsArgs): Promise<PreparedFlowTxs> {
  const metadata = getFlowMetadata(quote.metadata);
  const quoteFields = quote.get({ plain: true });
  return resolveBlockFlow(metadata.globals.request).prepareTxs({
    accounts: accountCapabilities(signingAccounts),
    destinationAddress,
    metadata,
    quote: quoteFields,
    taxId,
    userId
  });
}
