import {afterEach, describe, expect, it, mock} from "bun:test";
import bcrypt from "bcrypt";
import crypto from "crypto";
import Partner from "../../models/partner.model";
import ApiKey from "../../models/apiKey.model";
import {
  AuthenticatedPartner,
  generateApiKey,
  getKeyPrefix,
  hashApiKey,
  validateSecretApiKey
} from "./apiKeyAuth.helpers";

const originalApiKeyFindAll = ApiKey.findAll;
const originalApiKeyFindOne = ApiKey.findOne;
const originalPartnerFindOne = Partner.findOne;

function createSecretKeyRecord({
  userId = null,
  partnerId = "partner-id"
}: { userId?: string | null; partnerId?: string | null } = {}): ApiKey & { raw: string } {
  const secret = generateApiKey("secret", "test");
  const secretHash = bcrypt.hashSync(secret, 4);
  const record = Object.assign(new ApiKey(), {
    id: crypto.randomUUID(),
    isActive: true,
    keyHash: secretHash,
    keyPrefix: getKeyPrefix(secret),
    keyType: "secret" as const,
    partnerId,
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

  it("returns null when no matching key exists", async () => {
    ApiKey.findAll = mock(async () => []) as typeof ApiKey.findAll;
    const result = await validateSecretApiKey("sk_test_no_such_key_xxxxxxxxxxxxxxxx");
    expect(result).toBeNull();
  });
});

describe("hashApiKey + getKeyPrefix consistency", () => {
  it("produces a hash that validates against the original secret", async () => {
    const secret = generateApiKey("secret", "test");
    const hash = await hashApiKey(secret);
    expect(await bcrypt.compare(secret, hash)).toBe(true);
    expect(getKeyPrefix(secret)).toBe(secret.substring(0, 8));
  });
});