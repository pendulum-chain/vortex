import { AccountMeta, UnsignedTx } from "@vortexfi/shared";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";

export interface OfframpTransactionParams {
  quote: QuoteTicketAttributes;
  signingAccounts: AccountMeta[];
  userAddress?: string;
  pixDestination?: string;
  taxId?: string;
  receiverTaxId?: string;
  brlaEvmAddress?: string;
  userId?: string;
  fiatAccountId?: string;
  email?: string;
  destinationAddress?: string;
  ipAddress?: string;
}

export interface OfframpTransactionsWithMeta {
  unsignedTxs: UnsignedTx[];
  stateMeta: Partial<Record<string, unknown>>;
}
