import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AlfredpayAddFiatAccountRequest, AlfredpayListFiatAccountsResponse } from "@vortexfi/shared";
import type { CorridorId } from "@/domain/types";
import { AlfredpayService } from "@/services/api/alfredpay.service";

const FIVE_MINUTES = 5 * 60_000;

export const fiatAccountsQueryKey = (corridorId: CorridorId) => ["fiatAccounts", corridorId] as const;

export function useFiatAccounts(corridorId: CorridorId, enabled: boolean) {
  return useQuery<AlfredpayListFiatAccountsResponse>({
    enabled,
    queryFn: ({ signal }) => AlfredpayService.listFiatAccounts(corridorId, signal),
    queryKey: fiatAccountsQueryKey(corridorId),
    retry: false,
    staleTime: FIVE_MINUTES
  });
}

export function useAddFiatAccount(corridorId: CorridorId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AlfredpayAddFiatAccountRequest) => AlfredpayService.addFiatAccount(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: fiatAccountsQueryKey(corridorId) })
  });
}

export function useDeleteFiatAccount(corridorId: CorridorId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fiatAccountId: string) => AlfredpayService.deleteFiatAccount(fiatAccountId, corridorId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: fiatAccountsQueryKey(corridorId) })
  });
}
