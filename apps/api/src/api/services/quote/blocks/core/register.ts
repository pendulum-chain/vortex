import type { AccountMeta } from "@vortexfi/shared";
import type QuoteTicket from "../../../../../models/quoteTicket.model";
import { resolveBlockFlow } from "../flows/catalog";
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
  const evmEphemeral = signingAccounts.find(account => account.type === "EVM");
  if (!evmEphemeral) {
    throw new Error("Block flow transaction preparation requires an EVM ephemeral account");
  }
  const metadata = getFlowMetadata(quote.metadata);
  const quoteFields = quote.get({ plain: true });
  return resolveBlockFlow(metadata.globals.request).prepareTxs({
    destinationAddress,
    evmEphemeral,
    metadata,
    quote: quoteFields,
    taxId,
    userId
  });
}
