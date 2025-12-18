import { Networks, PaymentMethod } from "@vortexfi/shared";

export type TransactionStatus = "pending" | "failed" | "complete";

export type TransactionDestination = Networks | PaymentMethod;

export interface Transaction {
  id: string;
  fromNetwork: TransactionDestination;
  toNetwork: TransactionDestination;
  fromAmount: string;
  toAmount: string;
  status: TransactionStatus;
  date: Date;
  fromCurrency: string;
  toCurrency: string;
  externalTxHash?: string;
  externalTxExplorerLink?: string;
}

export interface TransactionGroup {
  month: string;
  transactions: Transaction[];
}
