import type { ApiCredentialRecord } from "@/services/api/api-credentials.service";

export type ApiCredentialStatus = "active" | "expired" | "revoked";

export interface ApiCredential extends ApiCredentialRecord {
  status: ApiCredentialStatus;
}

export function credentialStatus(record: ApiCredentialRecord, now = new Date()): ApiCredentialStatus {
  if (record.revokedAt) return "revoked";
  if (record.expiresAt && new Date(record.expiresAt) <= now) return "expired";
  return "active";
}

export function toApiCredentials(records: ApiCredentialRecord[], now = new Date()): ApiCredential[] {
  return records
    .map(record => ({ ...record, status: credentialStatus(record, now) }))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function keyPreview(key: string): string {
  return `${key.slice(0, 12)}••••${key.slice(-4)}`;
}
