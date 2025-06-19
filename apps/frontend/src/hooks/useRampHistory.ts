import { useQuery } from "@tanstack/react-query";
import { Transaction } from "../components/RampHistory/types";
import { RampService } from "../services/api/ramp.service";

export function useRampHistory(walletAddress: string | undefined) {
  return useQuery({
    enabled: !!walletAddress,
    queryFn: async () => {
      if (!walletAddress) {
        return { transactions: [] };
      }

      const response = await RampService.getRampHistory(walletAddress);

      const transactions: Transaction[] = response.transactions.map(
        tx =>
          ({
            date: new Date(tx.date),
            fromAmount: tx.fromAmount,
            fromCurrency: tx.fromCurrency,
            fromNetwork: tx.fromNetwork,
            id: tx.id,
            status: tx.status,
            toAmount: tx.toAmount,
            toCurrency: tx.toCurrency,
            toNetwork: tx.toNetwork
          }) as Transaction
      );

      return { transactions };
    },
    queryKey: ["rampHistory", walletAddress],
    refetchOnWindowFocus: true, // 5 minutes
    staleTime: 5 * 60 * 1000
  });
}
