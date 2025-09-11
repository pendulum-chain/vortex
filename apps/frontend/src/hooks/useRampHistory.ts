import { GetRampHistoryTransaction } from "@packages/shared";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";

import { Transaction, TransactionDestination, TransactionStatus } from "../components/menus/HistoryMenu/types";
import { usePolkadotWalletState } from "../contexts/polkadotWallet";
import { RampService } from "../services/api/ramp.service";

function formatTransaction(tx: GetRampHistoryTransaction): Transaction {
  return {
    ...tx,
    date: new Date(tx.date),
    fromNetwork: tx.fromNetwork as TransactionDestination,
    status: tx.status as TransactionStatus,
    toNetwork: tx.toNetwork as TransactionDestination
  };
}

export function useRampHistory(walletAddress?: string) {
  const { address: evmAddress } = useAccount();
  const { walletAccount: polkadotAccount } = usePolkadotWalletState();

  const addresses = walletAddress ? [walletAddress] : ([evmAddress, polkadotAccount?.address].filter(Boolean) as string[]);

  return useQuery({
    enabled: addresses.length > 0,
    queryFn: async () => {
      const allTransactions: Transaction[] = [];

      for (const address of addresses) {
        try {
          const response = await RampService.getRampHistory(address);
          const transactions = response.transactions.map(formatTransaction);
          allTransactions.push(...transactions);
        } catch (error) {
          console.warn(`Failed to fetch wallet history for ${address}:`, error);
        }
      }

      allTransactions.sort((a, b) => b.date.getTime() - a.date.getTime());

      return { transactions: allTransactions };
    },
    queryKey: ["rampHistory", ...addresses],
    refetchOnWindowFocus: true,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}
