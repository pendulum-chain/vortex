import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { SenderAccount, Transaction } from "@/domain/types";
import { mapRampHistoryTransaction } from "@/services/api/transaction.mappers";
import { TransactionsService } from "@/services/api/transactions.service";

export const TRANSACTIONS_QUERY_KEY = "transactions";

/**
 * The authenticated user's onramp and offramp history across wallet addresses.
 */
export function useTransactions(account: SenderAccount | undefined): {
  transactions: Transaction[];
  isLoading: boolean;
} {
  const query = useQuery({
    queryFn: () => TransactionsService.history(),
    queryKey: [TRANSACTIONS_QUERY_KEY],
    staleTime: 15_000
  });

  const transactions = useMemo(() => {
    if (!account || !query.data) {
      return [];
    }
    return query.data.transactions
      .map(tx => mapRampHistoryTransaction(tx, account.id))
      .filter((tx): tx is Transaction => tx !== null);
  }, [account, query.data]);

  return { isLoading: query.isLoading, transactions };
}
