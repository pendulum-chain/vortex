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
  create: (request: CreateApiCredentialRequest) => apiClient.post<CreateApiCredentialResponse>("/api-credentials", request),
  list: (signal?: AbortSignal) => apiClient.get<ListApiCredentialsResponse>("/api-credentials", { signal }),
  revoke: (credentialId: string) => apiClient.delete<void>(`/api-credentials/${credentialId}`)
};
