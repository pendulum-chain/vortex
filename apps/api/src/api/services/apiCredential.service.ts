import type { CorridorCountry, CorridorCustomerType } from "@vortexfi/shared";
import crypto from "crypto";
import { Op, QueryTypes, Transaction } from "sequelize";
import sequelize from "../../config/database";
import logger from "../../config/logger";
import ApiCredential, { ApiCredentialEnvironment } from "../../models/apiCredential.model";
import ManagedProfile from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import User from "../../models/user.model";
import { digestApiKey, generateApiKey, getSecretKeyLookupPrefix } from "../middlewares/apiKeyFormat";

export const MAX_ACTIVE_CREDENTIALS_PER_PROFILE = 5;
const DEFAULT_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_EXPIRY_MS = 2 * DEFAULT_EXPIRY_MS;

export interface CredentialContext {
  readonly credentialId: string;
  readonly environment: ApiCredentialEnvironment;
  readonly managedProfile?: Readonly<{
    allowedCorridors: readonly CorridorCountry[];
    allowedCustomerTypes: readonly CorridorCustomerType[] | null;
    controllingManagerProfileId: string;
    relationshipId: string;
  }>;
  readonly profileId: string;
  readonly partnerId: string | null;
  readonly strength: "public" | "secret";
}

export interface ApiCredentialDto {
  id: string;
  name: string;
  profileId: string;
  partnerId: string | null;
  environment: ApiCredentialEnvironment;
  publicKey: string;
  secretKeyPrefix: string;
  publicLastUsedAt: Date | null;
  secretLastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ApiCredentialServiceError extends Error {
  constructor(
    public readonly code:
      | "CREDENTIAL_LIMIT_REACHED"
      | "CREDENTIAL_ACCESS_DENIED"
      | "CREDENTIAL_NOT_FOUND"
      | "CREDENTIAL_SUBJECT_REQUIRED"
      | "INVALID_CREDENTIAL_SUBJECT"
      | "INVALID_CREDENTIAL_EXPIRY"
      | "INVALID_CREDENTIAL_NAME",
    message: string
  ) {
    super(message);
  }
}

function toDto(credential: ApiCredential): ApiCredentialDto {
  return {
    createdAt: credential.createdAt,
    environment: credential.environment,
    expiresAt: credential.expiresAt,
    id: credential.id,
    name: credential.name,
    partnerId: credential.partnerId,
    profileId: credential.profileId,
    publicKey: credential.publicKeyValue,
    publicLastUsedAt: credential.publicLastUsedAt,
    revokedAt: credential.revokedAt,
    secretKeyPrefix: credential.secretKeyPrefix,
    secretLastUsedAt: credential.secretLastUsedAt,
    updatedAt: credential.updatedAt
  };
}

function validateInput(name: unknown, expiresAt: unknown): { expiresAt: Date; name: string } {
  if (name !== undefined && typeof name !== "string") {
    throw new ApiCredentialServiceError("INVALID_CREDENTIAL_NAME", "name must be a string");
  }
  const normalizedName = typeof name === "string" ? name.trim() || "API Credential" : "API Credential";
  if (normalizedName.length > 100) {
    throw new ApiCredentialServiceError("INVALID_CREDENTIAL_NAME", "name must be at most 100 characters");
  }

  if (expiresAt !== undefined && typeof expiresAt !== "string") {
    throw new ApiCredentialServiceError("INVALID_CREDENTIAL_EXPIRY", "expiresAt must be a valid ISO-8601 date");
  }
  const now = Date.now();
  const expirationDate = expiresAt === undefined ? new Date(now + DEFAULT_EXPIRY_MS) : new Date(expiresAt);
  if (
    Number.isNaN(expirationDate.getTime()) ||
    expirationDate.getTime() <= now ||
    expirationDate.getTime() > now + MAX_EXPIRY_MS
  ) {
    throw new ApiCredentialServiceError(
      "INVALID_CREDENTIAL_EXPIRY",
      "expiresAt must be in the future and at most 2 years from now"
    );
  }
  return { expiresAt: expirationDate, name: normalizedName };
}

export async function createCredential(input: {
  environment: ApiCredentialEnvironment;
  expiresAt?: unknown;
  name?: unknown;
  partnerId?: string | null;
  profileId: string;
}): Promise<ApiCredentialDto & { secretKey: string }> {
  if (!input.profileId) {
    throw new ApiCredentialServiceError("CREDENTIAL_SUBJECT_REQUIRED", "A profile subject is required");
  }
  const validated = validateInput(input.name, input.expiresAt);
  const publicKey = generateApiKey("public", input.environment);
  const secretKey = generateApiKey("secret", input.environment);

  const credential = await sequelize.transaction(async transaction => {
    const profile = await User.findByPk(input.profileId, {
      attributes: ["id", "kind"],
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (!profile) {
      throw new ApiCredentialServiceError("CREDENTIAL_SUBJECT_REQUIRED", "Profile was not found");
    }
    if (profile.kind === "managed") {
      throw new ApiCredentialServiceError(
        "INVALID_CREDENTIAL_SUBJECT",
        "Managed-profile credentials must be issued by the controlling manager"
      );
    }

    return insertCredential(input, validated, publicKey, secretKey, transaction);
  });

  return { ...toDto(credential), secretKey };
}

export async function createManagedProfileCredential(input: {
  environment: ApiCredentialEnvironment;
  expiresAt?: unknown;
  managerProfileId: string;
  name?: unknown;
  profileId: string;
}): Promise<ApiCredentialDto & { secretKey: string }> {
  const validated = validateInput(input.name, input.expiresAt);
  const publicKey = generateApiKey("public", input.environment);
  const secretKey = generateApiKey("secret", input.environment);
  const credential = await sequelize.transaction(async transaction => {
    const profile = await User.findByPk(input.profileId, {
      attributes: ["id", "kind"],
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (profile?.kind !== "managed") {
      throw new ApiCredentialServiceError("CREDENTIAL_NOT_FOUND", "Managed profile was not found");
    }
    const relationship = await ManagedProfile.findOne({
      lock: transaction.LOCK.UPDATE,
      transaction,
      where: { managerProfileId: input.managerProfileId, profileId: input.profileId, status: "active" }
    });
    if (!relationship) {
      throw new ApiCredentialServiceError("CREDENTIAL_NOT_FOUND", "Managed profile was not found");
    }
    const manager = await ManagedProfileManager.findByPk(input.managerProfileId, { transaction });
    if (!manager?.isActive) {
      throw new ApiCredentialServiceError("CREDENTIAL_ACCESS_DENIED", "Managed-profile manager is not active");
    }
    return insertCredential({ ...input, partnerId: null }, validated, publicKey, secretKey, transaction);
  });
  return { ...toDto(credential), secretKey };
}

async function insertCredential(
  input: { environment: ApiCredentialEnvironment; partnerId?: string | null; profileId: string },
  validated: { expiresAt: Date; name: string },
  publicKey: string,
  secretKey: string,
  transaction: Transaction
): Promise<ApiCredential> {
  const activeCount = await ApiCredential.count({
    transaction,
    where: { expiresAt: { [Op.gt]: new Date() }, profileId: input.profileId, revokedAt: null }
  });
  if (activeCount >= MAX_ACTIVE_CREDENTIALS_PER_PROFILE) {
    throw new ApiCredentialServiceError(
      "CREDENTIAL_LIMIT_REACHED",
      `Active API credential limit reached (${MAX_ACTIVE_CREDENTIALS_PER_PROFILE})`
    );
  }
  return ApiCredential.create(
    {
      environment: input.environment,
      expiresAt: validated.expiresAt,
      name: validated.name,
      partnerId: input.partnerId ?? null,
      profileId: input.profileId,
      publicKeyValue: publicKey,
      secretKeyDigest: digestApiKey(secretKey),
      secretKeyPrefix: getSecretKeyLookupPrefix(secretKey)
    },
    { transaction }
  );
}

async function requireManagedCredentialSubject(managerProfileId: string, profileId: string): Promise<void> {
  const [manager, relationship, profile] = await Promise.all([
    ManagedProfileManager.findByPk(managerProfileId),
    ManagedProfile.findOne({ where: { managerProfileId, profileId, status: "active" } }),
    User.findByPk(profileId, { attributes: ["kind"] })
  ]);
  if (!manager?.isActive) {
    throw new ApiCredentialServiceError("CREDENTIAL_ACCESS_DENIED", "Managed-profile manager is not active");
  }
  if (!relationship || profile?.kind !== "managed") {
    throw new ApiCredentialServiceError("CREDENTIAL_NOT_FOUND", "Managed profile was not found");
  }
}

export async function listManagedProfileCredentials(managerProfileId: string, profileId: string): Promise<ApiCredentialDto[]> {
  await requireManagedCredentialSubject(managerProfileId, profileId);
  return listCredentials({ profileId });
}

export async function revokeManagedProfileCredential(
  managerProfileId: string,
  profileId: string,
  credentialId: string
): Promise<void> {
  await requireManagedCredentialSubject(managerProfileId, profileId);
  const [updated] = await ApiCredential.update({ revokedAt: new Date() }, { where: { id: credentialId, profileId } });
  if (updated === 0) throw new ApiCredentialServiceError("CREDENTIAL_NOT_FOUND", "API credential not found");
}

export async function listCredentials(filter: { partnerId?: string | null; profileId: string }): Promise<ApiCredentialDto[]> {
  return (
    await ApiCredential.findAll({
      order: [["createdAt", "DESC"]],
      where: { ...(filter.partnerId !== undefined ? { partnerId: filter.partnerId } : {}), profileId: filter.profileId }
    })
  ).map(toDto);
}

export async function revokeCredential(id: string, filter: { partnerId?: string | null; profileId: string }): Promise<void> {
  const [updated] = await ApiCredential.update(
    { revokedAt: new Date() },
    {
      where: {
        ...(filter.partnerId !== undefined ? { partnerId: filter.partnerId } : {}),
        id,
        profileId: filter.profileId,
        revokedAt: null
      }
    }
  );
  if (updated === 0) throw new ApiCredentialServiceError("CREDENTIAL_NOT_FOUND", "API credential not found");
}

async function context(credential: ApiCredential, strength: "public" | "secret"): Promise<CredentialContext | null> {
  const profile = await User.findByPk(credential.profileId, { attributes: ["kind"] });
  if (!profile) return null;
  let managedProfile: CredentialContext["managedProfile"];
  if (profile.kind === "managed") {
    if (credential.partnerId !== null) return null;
    const relationship = await ManagedProfile.findOne({ where: { profileId: credential.profileId, status: "active" } });
    if (!relationship) return null;
    const manager = await ManagedProfileManager.findByPk(relationship.managerProfileId);
    if (!manager?.isActive) return null;
    managedProfile = Object.freeze({
      allowedCorridors: Object.freeze([...manager.allowedCorridors]),
      allowedCustomerTypes: manager.allowedCustomerTypes ? Object.freeze([...manager.allowedCustomerTypes]) : null,
      controllingManagerProfileId: relationship.managerProfileId,
      relationshipId: relationship.id
    });
  }
  return Object.freeze({
    credentialId: credential.id,
    environment: credential.environment,
    ...(managedProfile ? { managedProfile } : {}),
    partnerId: credential.partnerId,
    profileId: credential.profileId,
    strength
  });
}

export async function validatePublicKey(publicKey: string): Promise<CredentialContext | null> {
  const credential = await ApiCredential.findOne({
    where: { expiresAt: { [Op.gt]: new Date() }, publicKeyValue: publicKey, revokedAt: null }
  });
  if (!credential) return null;
  const credentialContext = await context(credential, "public");
  if (!credentialContext) return null;
  credential
    .update({ publicLastUsedAt: new Date() })
    .catch(error => logger.error("Failed to update public credential usage", error));
  return credentialContext;
}

export async function validateSecretKey(secretKey: string): Promise<CredentialContext | null> {
  const candidates = await ApiCredential.findAll({
    where: { expiresAt: { [Op.gt]: new Date() }, revokedAt: null, secretKeyPrefix: getSecretKeyLookupPrefix(secretKey) }
  });
  const presented = Buffer.from(digestApiKey(secretKey), "hex");
  const credential = candidates.find(candidate => {
    if (!/^[0-9a-f]{64}$/.test(candidate.secretKeyDigest)) return false;
    const stored = Buffer.from(candidate.secretKeyDigest, "hex");
    return stored.length === presented.length && crypto.timingSafeEqual(stored, presented);
  });
  if (!credential) return null;
  const credentialContext = await context(credential, "secret");
  if (!credentialContext) return null;
  credential
    .update({ secretLastUsedAt: new Date() })
    .catch(error => logger.error("Failed to update secret credential usage", error));
  return credentialContext;
}

export async function assertApiCredentialSchemaReady(): Promise<void> {
  const expectedColumns = [
    "created_at",
    "environment",
    "expires_at",
    "id",
    "name",
    "partner_id",
    "profile_id",
    "public_key_value",
    "public_last_used_at",
    "revoked_at",
    "secret_key_digest",
    "secret_key_prefix",
    "secret_last_used_at",
    "updated_at"
  ];
  const columns = await sequelize.query<{ column_name: string; is_nullable: "NO" | "YES" }>(
    `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'api_credentials'`,
    { type: QueryTypes.SELECT }
  );
  const present = new Set(columns.map(column => column.column_name));
  const missing = expectedColumns.filter(column => !present.has(column));
  if (missing.length > 0) throw new Error(`api_credentials schema is incomplete; missing: ${missing.join(", ")}`);
  const nullableColumns = ["partner_id", "public_last_used_at", "revoked_at", "secret_last_used_at"];
  const nullableRequiredColumns = columns
    .filter(column => !nullableColumns.includes(column.column_name))
    .filter(column => column.is_nullable !== "NO")
    .map(column => column.column_name);
  if (nullableRequiredColumns.length > 0) {
    throw new Error(`api_credentials schema is incomplete; nullable required columns: ${nullableRequiredColumns.join(", ")}`);
  }
  const nonNullableOptionalColumns = columns
    .filter(column => nullableColumns.includes(column.column_name) && column.is_nullable !== "YES")
    .map(column => column.column_name);
  if (nonNullableOptionalColumns.length > 0) {
    throw new Error(
      `api_credentials schema is incomplete; non-null optional columns: ${nonNullableOptionalColumns.join(", ")}`
    );
  }

  const indexes = await sequelize.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'api_credentials'`,
    { type: QueryTypes.SELECT }
  );
  const presentIndexes = new Set(indexes.map(index => index.indexname));
  const expectedIndexes = [
    "api_credentials_pkey",
    "idx_api_credentials_partner_id",
    "idx_api_credentials_profile_id",
    "idx_api_credentials_secret_key_prefix",
    "uq_api_credentials_public_key_value",
    "uq_api_credentials_secret_key_digest"
  ];
  const missingIndexes = expectedIndexes.filter(index => !presentIndexes.has(index));
  if (missingIndexes.length > 0) {
    throw new Error(`api_credentials schema is incomplete; missing indexes: ${missingIndexes.join(", ")}`);
  }

  const constraints = await sequelize.query<{ conname: string }>(
    `SELECT conname FROM pg_constraint WHERE conrelid = 'api_credentials'::regclass`,
    { type: QueryTypes.SELECT }
  );
  const presentConstraints = new Set(constraints.map(constraint => constraint.conname));
  const expectedConstraints = [
    "api_credentials_partner_id_fkey",
    "api_credentials_profile_id_fkey",
    "chk_api_credentials_secret_digest",
    "chk_api_credentials_secret_prefix_length"
  ];
  const missingConstraints = expectedConstraints.filter(constraint => !presentConstraints.has(constraint));
  if (missingConstraints.length > 0) {
    throw new Error(`api_credentials schema is incomplete; missing constraints: ${missingConstraints.join(", ")}`);
  }

  const legacyTables = await sequelize.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'api_keys'`,
    { type: QueryTypes.SELECT }
  );
  if (legacyTables.length > 0) {
    throw new Error("legacy api_keys table still exists; run migration 061 before startup");
  }
}
