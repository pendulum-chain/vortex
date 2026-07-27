import { useQuery } from "@tanstack/react-query";
import type { EvmNetworks } from "@vortexfi/shared";
import { fetchTokenPortfolio } from "@/services/balance.service";

export function useTokenPortfolio(address: string | undefined, network: EvmNetworks) {
  return useQuery({
    enabled: address !== undefined,
    queryFn: () => fetchTokenPortfolio(address as string, network),
    queryKey: ["token-portfolio", address, network],
    refetchOnWindowFocus: true
  });
}
