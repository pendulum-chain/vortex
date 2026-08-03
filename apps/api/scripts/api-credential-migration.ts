import { readFile } from "node:fs/promises";
import { Op, Transaction } from "sequelize";
import sequelize from "../src/config/database";
import ApiCredential, { type ApiCredentialEnvironment } from "../src/models/apiCredential.model";
import ApiKey from "../src/models/apiKey.model";
import Partner from "../src/models/partner.model";
import User from "../src/models/user.model";

export interface ApiCredentialMigrationEntry {
  publicKeyId: string;
  secretKeyId: string;
  profileId: string;
  partnerId: string | null;
  name: string;
  expiresAt: string;
}

interface ValidatedCredential {
  entry: ApiCredentialMigrationEntry;
  environment: ApiCredentialEnvironment;
  expiresAt: Date;
  publicKey: ApiKey;
  publicKeyValue: string;
  secretKey: ApiKey;
  secretKeyDigest: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_KEY_PATTERN = /^pk_(live|test)_[a-zA-Z0-9]{32}$/;
const SECRET_PREFIX_PATTERN = /^sk_(live|test)_[a-zA-Z0-9]{8}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

function assertManifestEntry(value: unknown, index: number): asserts value is ApiCredentialMigrationEntry {
  if (!value || typeof value !== "object") throw new Error(`Manifest entry ${index} must be an object`);
  const entry = value as Record<string, unknown>;
  const exactKeys = ["expiresAt", "name", "partnerId", "profileId", "publicKeyId", "secretKeyId"];
  const keys = Object.keys(entry).sort();
  if (keys.length !== exactKeys.length || keys.some((key, keyIndex) => key !== exactKeys[keyIndex])) {
    throw new Error(`Manifest entry ${index} must contain exactly: ${exactKeys.join(", ")}`);
  }
  if (!UUID_PATTERN.test(String(entry.publicKeyId)) || !UUID_PATTERN.test(String(entry.secretKeyId))) {
    throw new Error(`Manifest entry ${index} has an invalid legacy key ID`);
  }
  if (!UUID_PATTERN.test(String(entry.profileId))) throw new Error(`Manifest entry ${index} has an invalid profileId`);
  if (entry.partnerId !== null && !UUID_PATTERN.test(String(entry.partnerId))) {
    throw new Error(`Manifest entry ${index} has an invalid partnerId`);
  }
  if (typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > 100) {
    throw new Error(`Manifest entry ${index} has an invalid name`);
  }
  if (typeof entry.expiresAt !== "string" || Number.isNaN(new Date(entry.expiresAt).getTime())) {
    throw new Error(`Manifest entry ${index} has an invalid expiresAt`);
  }
}

export async function loadApiCredentialMigrationManifest(path: string): Promise<ApiCredentialMigrationEntry[]> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("Credential migration manifest must be a JSON array");
  parsed.forEach(assertManifestEntry);
  return parsed;
}

function assertOwnership(row: ApiKey, entry: ApiCredentialMigrationEntry, label: string): void {
  if (row.userId !== entry.profileId || row.partnerId !== entry.partnerId) {
    throw new Error(`${label} row ${row.id} ownership does not match its manifest entry`);
  }
}

async function validateManifest(
  manifest: ApiCredentialMigrationEntry[],
  transaction?: Transaction
): Promise<ValidatedCredential[]> {
  const mappedIds = manifest.flatMap(entry => [entry.publicKeyId, entry.secretKeyId]);
  if (new Set(mappedIds).size !== mappedIds.length) throw new Error("Each legacy key ID may appear only once in the manifest");

  const activeRows = await ApiKey.findAll({
    ...(transaction ? { lock: Transaction.LOCK.UPDATE, transaction } : {}),
    where: { isActive: true }
  });
  const activeById = new Map(activeRows.map(row => [row.id, row]));
  const unmapped = activeRows.filter(row => !mappedIds.includes(row.id));
  if (unmapped.length > 0) {
    throw new Error(`${unmapped.length} active legacy api_keys row(s) are not explicitly mapped or revoked`);
  }
  if (mappedIds.some(id => !activeById.has(id))) {
    throw new Error("Every manifest key ID must reference an active legacy api_keys row");
  }

  const profileIds = [...new Set(manifest.map(entry => entry.profileId))];
  const partnerIds = [...new Set(manifest.map(entry => entry.partnerId).filter((id): id is string => id !== null))];
  const [profiles, partners] = await Promise.all([
    User.findAll({ attributes: ["id"], transaction, where: { id: { [Op.in]: profileIds } } }),
    Partner.findAll({ attributes: ["id"], transaction, where: { id: { [Op.in]: partnerIds } } })
  ]);
  if (profiles.length !== profileIds.length) throw new Error("A manifest profileId does not exist");
  if (partners.length !== partnerIds.length) throw new Error("A manifest partnerId does not exist");

  const validated = manifest.map(entry => {
    const publicKey = activeById.get(entry.publicKeyId);
    const secretKey = activeById.get(entry.secretKeyId);
    if (!publicKey || !secretKey) throw new Error("Every manifest key ID must reference an active legacy api_keys row");
    if (publicKey.keyType !== "public" || secretKey.keyType !== "secret") {
      throw new Error(`Manifest pair ${entry.publicKeyId}/${entry.secretKeyId} has incorrect key types`);
    }
    assertOwnership(publicKey, entry, "Public key");
    assertOwnership(secretKey, entry, "Secret key");

    const publicKeyValue = publicKey.keyValue;
    const publicMatch = publicKeyValue?.match(PUBLIC_KEY_PATTERN);
    const secretMatch = secretKey.keyPrefix.match(SECRET_PREFIX_PATTERN);
    if (!publicKeyValue || !publicMatch || !secretMatch || publicMatch[1] !== secretMatch[1]) {
      throw new Error(`Manifest pair ${entry.publicKeyId}/${entry.secretKeyId} has invalid or mismatched environments`);
    }
    const secretKeyDigest = secretKey.keyHash;
    if (!secretKeyDigest || !DIGEST_PATTERN.test(secretKeyDigest)) {
      throw new Error(`Secret key row ${entry.secretKeyId} does not contain a SHA-256 digest`);
    }

    return {
      entry,
      environment: publicMatch[1] as ApiCredentialEnvironment,
      expiresAt: new Date(entry.expiresAt),
      publicKey,
      publicKeyValue,
      secretKey,
      secretKeyDigest
    };
  });

  if (validated.length > 0) {
    const existingTarget = await ApiCredential.count({
      transaction,
      where: {
        [Op.or]: [
          { publicKeyValue: { [Op.in]: validated.map(pair => pair.publicKeyValue) } },
          { secretKeyDigest: { [Op.in]: validated.map(pair => pair.secretKeyDigest) } }
        ]
      }
    });
    if (existingTarget > 0) throw new Error("A manifest key is already present in api_credentials");
  }

  return validated;
}

export async function preflightApiCredentialMigration(manifest: ApiCredentialMigrationEntry[]): Promise<number> {
  return (await validateManifest(manifest)).length;
}

export async function migrateApiCredentials(manifest: ApiCredentialMigrationEntry[]): Promise<number> {
  return sequelize.transaction(async transaction => {
    const validated = await validateManifest(manifest, transaction);
    const revokedAt = new Date();

    for (const pair of validated) {
      await ApiCredential.create(
        {
          environment: pair.environment,
          expiresAt: pair.expiresAt,
          name: pair.entry.name,
          partnerId: pair.entry.partnerId,
          profileId: pair.entry.profileId,
          publicKeyValue: pair.publicKeyValue,
          publicLastUsedAt: pair.publicKey.lastUsedAt,
          secretKeyDigest: pair.secretKeyDigest,
          secretKeyPrefix: pair.secretKey.keyPrefix,
          secretLastUsedAt: pair.secretKey.lastUsedAt
        },
        { transaction }
      );
      await ApiKey.update(
        { isActive: false, revokedAt },
        { transaction, where: { id: { [Op.in]: [pair.entry.publicKeyId, pair.entry.secretKeyId] }, isActive: true } }
      );
    }

    return validated.length;
  });
}
