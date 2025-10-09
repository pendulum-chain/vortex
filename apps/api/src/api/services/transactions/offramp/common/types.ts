import { AccountMeta, PaymentData, UnsignedTx } from "@packages/shared";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";

export interface OfframpTransactionParams {
  quote: QuoteTicketAttributes;
  signingAccounts: AccountMeta[];
  stellarPaymentData?: PaymentData;
  userAddress?: string;
  pixDestination?: string;
  taxId?: string;
  receiverTaxId?: string;
  brlaEvmAddress?: string;
}

export interface OfframpTransactionsWithMeta {
  unsignedTxs: UnsignedTx[];
  stateMeta: Partial<Record<string, unknown>>;
}
