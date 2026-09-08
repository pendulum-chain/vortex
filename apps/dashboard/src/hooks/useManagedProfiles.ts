import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiError } from "@/services/api/api-client";
import { type ListManagedProfilesParams, ManagedProfilesService } from "@/services/api/managed-profiles.service";

export const MANAGED_PROFILES_QUERY_KEY = "managed-profiles";

export function shouldRetryManagedProfilesQuery(failureCount: number, error: unknown): boolean {
  return !(isApiError(error) && error.status >= 400 && error.status < 500) && failureCount < 2;
}

export function useManagedProfiles(params: ListManagedProfilesParams = {}, enabled = true) {
  return useQuery({
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => ManagedProfilesService.list(params, signal),
    queryKey: [MANAGED_PROFILES_QUERY_KEY, params],
    refetchOnWindowFocus: "always",
    retry: shouldRetryManagedProfilesQuery
  });
}
