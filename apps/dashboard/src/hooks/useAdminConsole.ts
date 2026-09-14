import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AdminConsoleService,
  type ListAdminAccountsParams,
  type StartImpersonationRequest
} from "@/services/api/admin-console.service";

export const ADMIN_ACCOUNTS_QUERY_KEY = "admin-accounts";
export const ADMIN_ACCOUNT_QUERY_KEY = "admin-account";
export const ADMIN_IMPERSONATION_SESSIONS_QUERY_KEY = "admin-impersonation-sessions";

export function useAdminAccounts(params: ListAdminAccountsParams) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => AdminConsoleService.listAccounts(params, signal),
    queryKey: [ADMIN_ACCOUNTS_QUERY_KEY, params]
  });
}

export function useAdminAccount(profileId: string) {
  return useQuery({
    enabled: !!profileId,
    queryFn: ({ signal }) => AdminConsoleService.getAccount(profileId, signal),
    queryKey: [ADMIN_ACCOUNT_QUERY_KEY, profileId]
  });
}

export function useAdminImpersonationSessions() {
  return useQuery({
    queryFn: ({ signal }) => AdminConsoleService.listImpersonationSessions(signal),
    queryKey: [ADMIN_IMPERSONATION_SESSIONS_QUERY_KEY]
  });
}

export function useStartImpersonation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: StartImpersonationRequest) => AdminConsoleService.startImpersonation(request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ADMIN_IMPERSONATION_SESSIONS_QUERY_KEY] })
  });
}
