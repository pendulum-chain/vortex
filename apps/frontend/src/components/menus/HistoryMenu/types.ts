import { Networks, PaymentMethod, TransactionStatus } from "@vortexfi/shared";

export type TransactionDestination = Networks | PaymentMethod;

export interface Transaction {
  id: string;
  from: TransactionDestination;
  to: TransactionDestination;
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
