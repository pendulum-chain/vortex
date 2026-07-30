import { apiClient } from "./api-client";

export type ApiKeyType = "public" | "secret";

export interface ApiKeyRecord {
  id: string;
  credentialId: string | null;
  type: ApiKeyType;
  keyPrefix: string;
  key?: string;
  name: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyValue {
  id: string;
  key: string;
  keyPrefix: string;
  name: string;
  type: ApiKeyType;
}

export interface CreateApiCredentialRequest {
  name: string;
  expiresAt: string;
}

export interface CreateApiCredentialResponse {
  credentialId: string;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
  publicKey: ApiKeyValue;
  secretKey: ApiKeyValue;
}

interface ListApiKeysResponse {
  apiKeys: ApiKeyRecord[];
}

export const ApiKeysService = {
  create: (request: CreateApiCredentialRequest) => apiClient.post<CreateApiCredentialResponse>("/api-keys", request),
  list: (signal?: AbortSignal) => apiClient.get<ListApiKeysResponse>("/api-keys", { signal }),
  revoke: (keyId: string, pairedKeyId?: string) =>
    apiClient.delete<void>(`/api-keys/${keyId}`, { data: pairedKeyId ? { pairedKeyId } : undefined })
};
