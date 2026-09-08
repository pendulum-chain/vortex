import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiCredentialsService, type CreateApiCredentialRequest } from "@/services/api/api-credentials.service";
import { useManagedProfileSelection } from "@/stores/managed-profile.store";

export const API_CREDENTIALS_QUERY_KEY = "api-credentials";

export function useApiCredentials() {
  const managedProfileId = useManagedProfileSelection()?.targetProfileId;
  return useQuery({
    queryFn: ({ signal }) => ApiCredentialsService.list(signal, managedProfileId),
    queryKey: [API_CREDENTIALS_QUERY_KEY, managedProfileId ?? "self"],
    retry: false
  });
}

export function useCreateApiCredential() {
  const queryClient = useQueryClient();
  const managedProfileId = useManagedProfileSelection()?.targetProfileId;
  return useMutation({
    mutationFn: (request: CreateApiCredentialRequest) => ApiCredentialsService.create(request, managedProfileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [API_CREDENTIALS_QUERY_KEY, managedProfileId ?? "self"] })
  });
}

export function useRevokeApiCredential() {
  const queryClient = useQueryClient();
  const managedProfileId = useManagedProfileSelection()?.targetProfileId;
  return useMutation({
    mutationFn: (credentialId: string) => ApiCredentialsService.revoke(credentialId, managedProfileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [API_CREDENTIALS_QUERY_KEY, managedProfileId ?? "self"] })
  });
}
