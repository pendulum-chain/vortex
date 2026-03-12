import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AlfredpayAddFiatAccountRequest } from "@vortexfi/shared";
import { activeOptions, cacheKeys } from "../../constants/cache";
import { AlfredpayService } from "../../services/api/alfredpay.service";

export function useFiatAccounts(country: string, options?: { enabled?: boolean }) {
  const enabled = (options?.enabled ?? true) && !!country;
  return useQuery({
    enabled,
    queryFn: () => AlfredpayService.listFiatAccounts(country),
    queryKey: [cacheKeys.fiatAccounts, country],
    ...activeOptions["5m"]
  });
}

export function useAddFiatAccount(country: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AlfredpayAddFiatAccountRequest) => AlfredpayService.addFiatAccount(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [cacheKeys.fiatAccounts, country] })
  });
}

export function useDeleteFiatAccount(country: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fiatAccountId: string) => AlfredpayService.deleteFiatAccount(fiatAccountId, country),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [cacheKeys.fiatAccounts, country] })
  });
}
