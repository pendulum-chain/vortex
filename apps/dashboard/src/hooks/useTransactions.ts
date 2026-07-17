import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import type { SenderAccount, Transaction } from "@/domain/types";
import { mapRampHistoryTransaction } from "@/services/api/transaction.mappers";
import { TransactionsService } from "@/services/api/transactions.service";

export const TRANSACTIONS_QUERY_KEY = "transactions";

/**
 * The authenticated user's payout history for their connected wallet, from
 * GET /v1/ramp/history/:walletAddress. Empty until a wallet is connected.
 */
export function useTransactions(account: SenderAccount | undefined): {
  transactions: Transaction[];
  isLoading: boolean;
  walletConnected: boolean;
} {
  const { address } = useAccount();
  const query = useQuery({
    enabled: !!address,
    queryFn: () => TransactionsService.history(address as string),
    queryKey: [TRANSACTIONS_QUERY_KEY, address],
    staleTime: 15_000
  });

  const transactions = useMemo(() => {
    if (!account || !address || !query.data) {
      return [];
    }
    return query.data.transactions
      .map(tx => mapRampHistoryTransaction(tx, account.id, address))
      .filter((tx): tx is Transaction => tx !== null);
  }, [account, address, query.data]);

  return { isLoading: query.isLoading, transactions, walletConnected: !!address };
}
