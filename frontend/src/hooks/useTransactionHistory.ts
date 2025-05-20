import { useQuery } from '@tanstack/react-query';
import { RampService } from '../services/api/ramp.service';
import { Transaction } from '../components/RampHistory/types';

export function useTransactionHistory(walletAddress: string | undefined) {
  return useQuery({
    queryKey: ['transactionHistory', walletAddress],
    queryFn: async () => {
      if (!walletAddress) {
        return { transactions: [] };
      }

      const response = await RampService.getTransactionHistory(walletAddress);

      const transactions: Transaction[] = response.transactions.map((tx: Transaction) => ({
        id: tx.id,
        fromNetwork: tx.fromNetwork,
        toNetwork: tx.toNetwork,
        fromAmount: tx.fromAmount,
        toAmount: tx.toAmount,
        status: tx.status,
        date: new Date(tx.date),
        fromCurrency: tx.fromCurrency,
        toCurrency: tx.toCurrency,
      }));

      return { transactions };
    },
    enabled: !!walletAddress,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
}
