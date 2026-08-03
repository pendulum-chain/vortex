import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  type ApiCredentialMigrationEntry,
  migrateApiCredentials,
  preflightApiCredentialMigration
} from "../../../scripts/api-credential-migration";
import ApiCredential from "../../models/apiCredential.model";
import ApiKey from "../../models/apiKey.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestPartner, createTestUser } from "../../test-utils/factories";

describe("legacy API credential migration", () => {
  beforeAll(setupTestDatabase);
  beforeEach(resetTestDatabase);

  async function legacyPair(): Promise<ApiCredentialMigrationEntry> {
    const profile = await createTestUser();
    const partner = await createTestPartner();
    const publicKey = "pk_test_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456";
    const secretKey = "sk_test_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456";
    const common = {
      expiresAt: new Date(Date.now() + 86_400_000),
      isActive: true,
      lastUsedAt: null,
      name: "legacy",
      partnerId: partner.id,
      partnerName: partner.name,
      revokedAt: null,
      scopes: null,
      userId: profile.id
    };
    const publicRow = await ApiKey.create({
      ...common,
      keyHash: null,
      keyPrefix: publicKey.slice(0, 8),
      keyType: "public",
      keyValue: publicKey
    });
    const secretRow = await ApiKey.create({
      ...common,
      keyHash: createHash("sha256").update(secretKey).digest("hex"),
      keyPrefix: secretKey.slice(0, 16),
      keyType: "secret",
      keyValue: null
    });
    return {
      expiresAt: common.expiresAt.toISOString(),
      name: "migrated credential",
      partnerId: partner.id,
      profileId: profile.id,
      publicKeyId: publicRow.id,
      secretKeyId: secretRow.id
    };
  }

  it("preflights without writing, then inserts and revokes the exact mapped pair transactionally", async () => {
    const entry = await legacyPair();
    expect(await preflightApiCredentialMigration([entry])).toBe(1);
    expect(await ApiCredential.count()).toBe(0);

    expect(await migrateApiCredentials([entry])).toBe(1);
    const credential = await ApiCredential.findOne();
    expect(credential).toMatchObject({
      environment: "test",
      name: entry.name,
      partnerId: entry.partnerId,
      profileId: entry.profileId
    });
    expect(await ApiKey.count({ where: { isActive: true } })).toBe(0);
  });

  it("fails preflight if any active row is unmapped or the secret is not a SHA-256 digest", async () => {
    const entry = await legacyPair();
    await ApiKey.create({
      expiresAt: null,
      isActive: true,
      keyHash: null,
      keyPrefix: "pk_test_",
      keyType: "public",
      keyValue: "pk_test_12345678901234567890123456789012",
      lastUsedAt: null,
      name: "unmapped",
      partnerId: null,
      partnerName: null,
      revokedAt: null,
      scopes: null,
      userId: null
    });
    await expect(preflightApiCredentialMigration([entry])).rejects.toThrow("not explicitly mapped or revoked");

    await ApiKey.destroy({ where: { name: "unmapped" } });
    await ApiKey.update({ keyHash: "$2b$10$legacy" }, { where: { id: entry.secretKeyId } });
    await expect(preflightApiCredentialMigration([entry])).rejects.toThrow("does not contain a SHA-256 digest");
  });
});
