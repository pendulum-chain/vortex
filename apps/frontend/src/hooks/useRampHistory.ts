import { useQuery } from '@tanstack/react-query';
import { Transaction } from '../components/RampHistory/types';
import { RampService } from '../services/api/ramp.service';

export function useRampHistory(walletAddress: string | undefined) {
  return useQuery({
    queryKey: ['rampHistory', walletAddress],
    queryFn: async () => {
      if (!walletAddress) {
        return { transactions: [] };
      }

      const response = await RampService.getRampHistory(walletAddress);

      const transactions: Transaction[] = response.transactions.map(
        (tx) =>
          ({
            id: tx.id,
            fromNetwork: tx.fromNetwork,
            toNetwork: tx.toNetwork,
            fromAmount: tx.fromAmount,
            toAmount: tx.toAmount,
            status: tx.status,
            date: new Date(tx.date),
            fromCurrency: tx.fromCurrency,
            toCurrency: tx.toCurrency,
          }) as Transaction,
      );

      return { transactions };
    },
    enabled: !!walletAddress,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
}
