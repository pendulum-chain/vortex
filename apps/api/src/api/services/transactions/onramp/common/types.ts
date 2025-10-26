import { AccountMeta, UnsignedTx } from "@packages/shared";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";

export interface OnrampTransactionParams {
  quote: QuoteTicketAttributes;
  signingAccounts: AccountMeta[];
  destinationAddress: string;
}

export type AveniaOnrampTransactionParams = OnrampTransactionParams & { taxId: string };

export type MoneriumOnrampTransactionParams = OnrampTransactionParams & { moneriumWalletAddress: string };

export interface OnrampTransactionsWithMeta {
  unsignedTxs: UnsignedTx[];
  stateMeta: Partial<Record<string, unknown>>;
}
