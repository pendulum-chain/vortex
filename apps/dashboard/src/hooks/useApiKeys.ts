import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiKeysService, type CreateApiCredentialRequest } from "@/services/api/api-keys.service";

export const API_KEYS_QUERY_KEY = ["api-keys"] as const;

export function useApiKeys() {
  return useQuery({
    queryFn: ({ signal }) => ApiKeysService.list(signal),
    queryKey: API_KEYS_QUERY_KEY,
    retry: false
  });
}

export function useCreateApiCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateApiCredentialRequest) => ApiKeysService.create(request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY })
  });
}

export function useRevokeApiCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ keyId, pairedKeyId }: { keyId: string; pairedKeyId?: string }) => ApiKeysService.revoke(keyId, pairedKeyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY })
  });
}
