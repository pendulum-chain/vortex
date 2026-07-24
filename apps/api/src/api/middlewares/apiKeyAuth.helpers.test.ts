import {afterEach, describe, expect, it, mock} from "bun:test";
import bcrypt from "bcrypt";
import crypto from "crypto";
import Partner from "../../models/partner.model";
import ApiKey from "../../models/apiKey.model";
import {
  AuthenticatedPartner,
  digestApiKey,
  generateApiKey,
  getKeyPrefix,
  getSecretKeyLookupPrefix,
  validateSecretApiKey
} from "./apiKeyAuth.helpers";

const originalApiKeyFindAll = ApiKey.findAll;
const originalApiKeyFindOne = ApiKey.findOne;
const originalPartnerFindOne = Partner.findOne;

function createSecretKeyRecord({
  userId = null,
  partnerId = "partner-id",
  partnerName = null
}: { userId?: string | null; partnerId?: string | null; partnerName?: string | null } = {}): ApiKey & { raw: string } {
  const secret = generateApiKey("secret", "test");
  const secretHash = bcrypt.hashSync(secret, 4);
  const record = Object.assign(new ApiKey(), {
    id: crypto.randomUUID(),
    isActive: true,
    keyHash: secretHash,
    keyPrefix: getKeyPrefix(secret),
    keyType: "secret" as const,
    partnerId,
    partnerName,
    raw: secret,
    userId
  });
  // validateSecretApiKey fire-and-forgets keyRecord.update({lastUsedAt}); on a
  // real instance that issues live SQL against whatever DB the env points at.
  record.update = (async () => record) as typeof record.update;
  return record;
}

describe("validateSecretApiKey - apiKeyUserId propagation", () => {
  afterEach(() => {
    ApiKey.findAll = originalApiKeyFindAll;
    ApiKey.findOne = originalApiKeyFindOne;
    Partner.findOne = originalPartnerFindOne;
  });

  it("returns apiKeyId and apiKeyUserId with a partner for partner-scoped keys", async () => {
    const key = createSecretKeyRecord({userId: "user-bound", partnerId: "partner-id"});
    ApiKey.findAll = mock(
      async () => [key as unknown as ApiKey]
    ) as typeof ApiKey.findAll;
    Partner.findOne = mock(
      async () => ({id: "partner-id", isActive: true, name: "TestPartner"})
    ) as typeof Partner.findOne;

    const result = await validateSecretApiKey(key.raw);
    expect(result).not.toBeNull();
    expect(result?.apiKeyId).toBe(key.id);
    expect(result?.apiKeyUserId).toBe("user-bound");
    expect(result?.partner).not.toBeNull();
    expect((result?.partner as AuthenticatedPartner).name).toBe("TestPartner");
    expect((result?.partner as AuthenticatedPartner).id).toBe("partner-id");
  });

  it("returns apiKeyUserId = null for an unlinked partner-scoped key", async () => {
    const key = createSecretKeyRecord({userId: null, partnerId: "partner-id"});
    ApiKey.findAll = mock(
      async () => [key as unknown as ApiKey]
    ) as typeof ApiKey.findAll;
    Partner.findOne = mock(
      async () => ({id: "partner-id", isActive: true, name: "TestPartner"})
    ) as typeof Partner.findOne;

    const result = await validateSecretApiKey(key.raw);
    expect(result).not.toBeNull();
    expect(result?.apiKeyUserId).toBeNull();
    expect(result?.partner).not.toBeNull();
  });

  it("returns partner=null for a user-scoped key (no partnerId, userId set)", async () => {
    const key = createSecretKeyRecord({userId: "user-scoped", partnerId: null});
    ApiKey.findAll = mock(
      async () => [key as unknown as ApiKey]
    ) as typeof ApiKey.findAll;
    Partner.findOne = mock(
      async () => ({id: "partner-id", isActive: true, name: "TestPartner"})
    ) as typeof Partner.findOne;

    const result = await validateSecretApiKey(key.raw);
    expect(result).not.toBeNull();
    expect(result?.apiKeyId).toBe(key.id);
    expect(result?.apiKeyUserId).toBe("user-scoped");
    expect(result?.partner).toBeNull();
    expect(Partner.findOne).toHaveBeenCalledTimes(0);
  });

  it("returns null for a key with no partnerId and no userId (unusable)", async () => {
    const key = createSecretKeyRecord({userId: null, partnerId: null});
    ApiKey.findAll = mock(
      async () => [key as unknown as ApiKey]
    ) as typeof ApiKey.findAll;

    const result = await validateSecretApiKey(key.raw);
    expect(result).toBeNull();
  });

  it("rejects an orphaned partner key instead of degrading it into a user-scoped key", async () => {
    // Deleting a partner row sets partner_id NULL (FK ON DELETE SET NULL) but keeps
    // partner_name — such a key is revoked, even when it carries a linked user.
    const key = createSecretKeyRecord({partnerId: null, partnerName: "DeletedPartner", userId: "user-bound"});
    ApiKey.findAll = mock(
      async () => [key as unknown as ApiKey]
    ) as typeof ApiKey.findAll;

    const result = await validateSecretApiKey(key.raw);
    expect(result).toBeNull();
  });

  it("returns null when no matching key exists", async () => {
    ApiKey.findAll = mock(async () => []) as typeof ApiKey.findAll;
    const result = await validateSecretApiKey("sk_test_no_such_key_xxxxxxxxxxxxxxxx");
    expect(result).toBeNull();
  });
});

describe("digestApiKey + prefix helpers", () => {
  it("produces a stable SHA-256 hex digest and the documented prefixes", () => {
    const secret = generateApiKey("secret", "test");
    expect(digestApiKey(secret)).toMatch(/^[0-9a-f]{64}$/);
    expect(digestApiKey(secret)).toBe(digestApiKey(secret));
    expect(getKeyPrefix(secret)).toBe(secret.substring(0, 8));
    expect(getSecretKeyLookupPrefix(secret)).toBe(secret.substring(0, 16));
  });
});

describe("validateSecretApiKey - O(1) lookup, digest verification, legacy upgrade (SPEC-018)", () => {
  afterEach(() => {
    ApiKey.findAll = originalApiKeyFindAll;
    ApiKey.findOne = originalApiKeyFindOne;
    Partner.findOne = originalPartnerFindOne;
  });

  function createDigestKeyRecord(): ApiKey & { raw: string } {
    const secret = generateApiKey("secret", "test");
    const record = Object.assign(new ApiKey(), {
      id: crypto.randomUUID(),
      isActive: true,
      keyHash: digestApiKey(secret),
      keyPrefix: getSecretKeyLookupPrefix(secret),
      keyType: "secret" as const,
      partnerId: null,
      partnerName: null,
      raw: secret,
      userId: "user-1"
    });
    record.update = (async () => record) as typeof record.update;
    return record;
  }

  it("finds a new-format key by its 16-char lookup prefix and verifies the SHA-256 digest", async () => {
    const key = createDigestKeyRecord();
    const findAllMock = mock(async () => [key as unknown as ApiKey]);
    ApiKey.findAll = findAllMock as typeof ApiKey.findAll;

    const result = await validateSecretApiKey(key.raw);

    expect(result?.apiKeyId).toBe(key.id);
    // Exactly one lookup, keyed by the 16-char prefix — never a broad prefix scan.
    expect(findAllMock).toHaveBeenCalledTimes(1);
    const where = (findAllMock.mock.calls[0] as unknown as [{ where: { keyPrefix: string } }])[0].where;
    expect(where.keyPrefix).toBe(getSecretKeyLookupPrefix(key.raw));
  });

  it("rejects a wrong key against a digest record without falling through", async () => {
    const key = createDigestKeyRecord();
    const other = generateApiKey("secret", "test");
    ApiKey.findAll = mock(async () => [key as unknown as ApiKey]) as typeof ApiKey.findAll;

    expect(await validateSecretApiKey(other)).toBeNull();
  });

  it("falls back to the legacy 8-char prefix for old rows and upgrades them in place", async () => {
    const key = createSecretKeyRecord({ partnerId: null, userId: "user-legacy" });
    // Legacy rows only exist under the 8-char prefix: the 16-char lookup finds nothing.
    const findAllMock = mock(async ({ where }: { where: { keyPrefix: string } }) =>
      where.keyPrefix === getKeyPrefix(key.raw) ? [key as unknown as ApiKey] : []
    );
    ApiKey.findAll = findAllMock as typeof ApiKey.findAll;
    const updateMock = mock(async () => key);
    key.update = updateMock as typeof key.update;

    const result = await validateSecretApiKey(key.raw);

    expect(result?.apiKeyUserId).toBe("user-legacy");
    expect(findAllMock).toHaveBeenCalledTimes(2);
    // The matched legacy row is upgraded to the O(1) format (digest + 16-char prefix).
    const upgradeCall = (updateMock.mock.calls as unknown as [Record<string, string>][])
      .map(call => call[0])
      .find(args => args.keyHash !== undefined);
    expect(upgradeCall).toEqual({
      keyHash: digestApiKey(key.raw),
      keyPrefix: getSecretKeyLookupPrefix(key.raw)
    });
  });
});