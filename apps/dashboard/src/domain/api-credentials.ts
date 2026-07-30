import type { ApiKeyRecord } from "@/services/api/api-keys.service";

export interface ApiCredential {
  id: string;
  credentialId: string | null;
  name: string;
  environment: "Live" | "Test";
  publicKey: ApiKeyRecord | null;
  secretKey: ApiKeyRecord | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  isLegacy: boolean;
}

function baseName(name: string | null): string {
  if (!name || name === "Public Key" || name === "Secret Key") return "API Key";
  return name.replace(/\s*\((Public|Secret)\)$/, "");
}

function latestDate(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return new Date(left) > new Date(right) ? left : right;
}

function toCredential(id: string, records: ApiKeyRecord[], isLegacy: boolean): ApiCredential {
  const publicKey = records.find(key => key.type === "public") ?? null;
  const secretKey = records.find(key => key.type === "secret") ?? null;
  const representative = publicKey ?? secretKey ?? records[0];

  if (!representative) {
    throw new Error("Cannot build an API credential without key records");
  }

  return {
    createdAt: representative.createdAt,
    credentialId: representative.credentialId,
    environment: representative.keyPrefix.includes("_test_") ? "Test" : "Live",
    expiresAt: representative.expiresAt,
    id,
    isLegacy,
    lastUsedAt: latestDate(publicKey?.lastUsedAt ?? null, secretKey?.lastUsedAt ?? null),
    name: baseName(representative.name),
    publicKey,
    secretKey
  };
}

export function groupApiCredentials(records: ApiKeyRecord[]): ApiCredential[] {
  const grouped = new Map<string, ApiKeyRecord[]>();
  const credentials: ApiCredential[] = [];

  for (const record of records) {
    if (!record.credentialId) {
      credentials.push(toCredential(`legacy:${record.id}`, [record], true));
      continue;
    }
    grouped.set(record.credentialId, [...(grouped.get(record.credentialId) ?? []), record]);
  }

  for (const [credentialId, pair] of grouped) {
    credentials.push(toCredential(credentialId, pair, false));
  }

  return credentials.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function keyPreview(key: ApiKeyRecord | null): string {
  if (!key) return "Unavailable";
  if (!key.key) return `${key.keyPrefix}••••••••`;
  return `${key.key.slice(0, 12)}••••${key.key.slice(-4)}`;
}
