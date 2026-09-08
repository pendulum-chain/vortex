import { apiClient } from "./api-client";

export interface ApiCredentialRecord {
  id: string;
  name: string;
  profileId: string;
  partnerId: string | null;
  environment: "live" | "test";
  publicKey: string;
  secretKeyPrefix: string;
  publicLastUsedAt: string | null;
  secretLastUsedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApiCredentialRequest {
  name: string;
  expiresAt: string;
}

export interface CreateApiCredentialResponse extends ApiCredentialRecord {
  secretKey: string;
}

interface ListApiCredentialsResponse {
  credentials: ApiCredentialRecord[];
}

export const ApiCredentialsService = {
  create: (request: CreateApiCredentialRequest, managedProfileId?: string) =>
    apiClient.post<CreateApiCredentialResponse>(
      managedProfileId ? `/managed-profiles/${managedProfileId}/api-credentials` : "/api-credentials",
      request
    ),
  list: (signal?: AbortSignal, managedProfileId?: string) =>
    apiClient.get<ListApiCredentialsResponse>(
      managedProfileId ? `/managed-profiles/${managedProfileId}/api-credentials` : "/api-credentials",
      { signal }
    ),
  revoke: (credentialId: string, managedProfileId?: string) =>
    apiClient.delete<void>(
      managedProfileId
        ? `/managed-profiles/${managedProfileId}/api-credentials/${credentialId}`
        : `/api-credentials/${credentialId}`
    )
};
