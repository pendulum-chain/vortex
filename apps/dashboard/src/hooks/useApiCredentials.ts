import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiCredentialsService, type CreateApiCredentialRequest } from "@/services/api/api-credentials.service";

export const API_CREDENTIALS_QUERY_KEY = ["api-credentials"] as const;

export function useApiCredentials() {
  return useQuery({
    queryFn: ({ signal }) => ApiCredentialsService.list(signal),
    queryKey: API_CREDENTIALS_QUERY_KEY,
    retry: false
  });
}

export function useCreateApiCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateApiCredentialRequest) => ApiCredentialsService.create(request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: API_CREDENTIALS_QUERY_KEY })
  });
}

export function useRevokeApiCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentialId: string) => ApiCredentialsService.revoke(credentialId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: API_CREDENTIALS_QUERY_KEY })
  });
}
