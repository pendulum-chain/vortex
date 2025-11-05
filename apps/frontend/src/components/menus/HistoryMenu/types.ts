import { Networks, PaymentMethod } from "@vortexfi/shared";

export type TransactionStatus = "success" | "pending" | "failed";

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
}

export interface TransactionGroup {
  month: string;
  transactions: Transaction[];
}
