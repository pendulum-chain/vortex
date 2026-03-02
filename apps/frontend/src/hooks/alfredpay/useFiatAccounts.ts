import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AlfredpayAddFiatAccountRequest } from "@vortexfi/shared";
import { AlfredpayService } from "../../services/api/alfredpay.service";

export function useFiatAccounts(country: string, options?: { enabled?: boolean }) {
  return useQuery({
    enabled: (options?.enabled ?? true) && !!country,
    queryFn: () => AlfredpayService.listFiatAccounts(country),
    queryKey: ["fiatAccounts", country]
  });
}

export function useAddFiatAccount(country: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AlfredpayAddFiatAccountRequest) => AlfredpayService.addFiatAccount(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fiatAccounts", country] });
    }
  });
}

export function useDeleteFiatAccount(country: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fiatAccountId: string) => AlfredpayService.deleteFiatAccount(fiatAccountId, country),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fiatAccounts", country] });
    }
  });
}
