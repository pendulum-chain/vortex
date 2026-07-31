import { afterEach, describe, expect, it, mock } from "bun:test";
import httpStatus from "http-status";
import sequelize from "../../config/database";
import ApiKey from "../../models/apiKey.model";
import { createUserApiKey, listUserApiKeys, MAX_ACTIVE_KEYS_PER_USER, revokeUserApiKey } from "./userApiKeys.controller";

function createResponse() {
  const res = {
    body: undefined as unknown,
    send: mock(() => res),
    statusCode: Number(httpStatus.OK),
    json: mock((body: unknown) => {
      res.body = body;
      return res;
    }),
    status: mock((statusCode: number) => {
      res.statusCode = statusCode;
      return res;
    })
  };

  return res;
}

describe("createUserApiKey", () => {
  const originalCount = ApiKey.count;
  const originalCreate = ApiKey.create;
  const originalTransaction = sequelize.transaction;

  afterEach(() => {
    ApiKey.count = originalCount;
    ApiKey.create = originalCreate;
    sequelize.transaction = originalTransaction;
  });

  it("rejects creation with 409 when the per-user active key cap is reached", async () => {
    ApiKey.count = mock(async () => MAX_ACTIVE_KEYS_PER_USER) as unknown as typeof ApiKey.count;

    const res = createResponse();
    await createUserApiKey({ body: {}, userId: "user-1" } as never, res as never);

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect((res.body as { error: { code: string } }).error.code).toBe("API_KEY_LIMIT_REACHED");
  });

  it("rejects an expiration date in the past", async () => {
    ApiKey.count = mock(async () => 0) as unknown as typeof ApiKey.count;

    const res = createResponse();
    await createUserApiKey(
      { body: { expiresAt: "2020-01-01T00:00:00.000Z" }, userId: "user-1" } as never,
      res as never
    );

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect((res.body as { error: { code: string } }).error.code).toBe("INVALID_EXPIRES_AT");
  });

  it("creates one credential pair with the expected lookup prefixes", async () => {
    const records: Array<Record<string, unknown>> = [];
    ApiKey.count = mock(async () => 0) as unknown as typeof ApiKey.count;
    ApiKey.create = mock(async attributes => {
      const record = {
        ...attributes,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        id: `${attributes.keyType}-key-id`
      };
      records.push(record);
      return record;
    }) as unknown as typeof ApiKey.create;
    sequelize.transaction = mock(async callback => callback({} as never)) as unknown as typeof sequelize.transaction;

    const res = createResponse();
    await createUserApiKey({ body: { name: "Production" }, userId: "user-1" } as never, res as never);

    expect(res.statusCode).toBe(httpStatus.CREATED);
    expect(records).toHaveLength(2);
    expect(records[0]?.credentialId).toBe(records[1]?.credentialId);
    expect((res.body as { credentialId: string }).credentialId).toBe(records[0]?.credentialId as string);
    const publicRecord = records.find(record => record.keyType === "public");
    const secretRecord = records.find(record => record.keyType === "secret");
    expect(publicRecord?.keyPrefix).toBe((publicRecord?.keyValue as string).slice(0, 8));
    expect(secretRecord?.keyPrefix).toHaveLength(16);
    expect(records.find(record => record.keyType === "secret")?.keyValue).toBeNull();
    expect(records.find(record => record.keyType === "secret")?.keyHash).toBeString();
  });
});

describe("listUserApiKeys", () => {
  const originalFindAll = ApiKey.findAll;

  afterEach(() => {
    ApiKey.findAll = originalFindAll;
  });

  it("returns credential IDs and never returns a stored secret value", async () => {
    let query: { where?: Record<string, unknown> } | undefined;
    ApiKey.findAll = mock(async options => {
      query = options as { where?: Record<string, unknown> };
      return [
        {
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          credentialId: "credential-id",
          expiresAt: null,
          id: "secret-key-id",
          isActive: true,
          keyPrefix: "sk_test_",
          keyType: "secret",
          keyValue: null,
          lastUsedAt: null,
          name: "Production (Secret)",
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        }
      ];
    }) as unknown as typeof ApiKey.findAll;

    const res = createResponse();
    await listUserApiKeys({ userId: "user-1" } as never, res as never);

    expect(res.statusCode).toBe(httpStatus.OK);
    const listed = (res.body as { apiKeys: Array<{ credentialId: string; key?: string }> }).apiKeys[0];
    expect(listed?.credentialId).toBe("credential-id");
    expect(listed?.key).toBeUndefined();
    expect(query?.where).toMatchObject({ partnerId: null, partnerName: null, userId: "user-1" });
  });
});

describe("revokeUserApiKey", () => {
  const originalFindOne = ApiKey.findOne;
  const originalTransaction = sequelize.transaction;

  afterEach(() => {
    ApiKey.findOne = originalFindOne;
    sequelize.transaction = originalTransaction;
  });

  function stubKeyPair(secretCredentialId: string | null = "credential-id", publicCredentialId: string | null = "credential-id") {
    const updates: Array<{ id: string; changes: unknown }> = [];
    const secretKey = {
      credentialId: secretCredentialId,
      id: "secret-key-id",
      keyType: "secret",
      name: "Secret Key",
      update: mock(async (changes: unknown) => {
        updates.push({ changes, id: "secret-key-id" });
      })
    };
    const publicKey = {
      credentialId: publicCredentialId,
      id: "public-key-id",
      keyType: "public",
      name: "Public Key",
      update: mock(async (changes: unknown) => {
        updates.push({ changes, id: "public-key-id" });
      })
    };

    ApiKey.findOne = mock(async ({ where }: { where: { id: string } }) => {
      if (where.id === "secret-key-id") return secretKey;
      if (where.id === "public-key-id") return publicKey;
      return null;
    }) as unknown as typeof ApiKey.findOne;
    sequelize.transaction = mock(async callback => callback({} as never)) as unknown as typeof sequelize.transaction;

    return updates;
  }

  const expectedPairUpdates = [
    { changes: { isActive: false, revokedAt: expect.any(Date) }, id: "secret-key-id" },
    { changes: { isActive: false, revokedAt: expect.any(Date) }, id: "public-key-id" }
  ];

  it("revokes default-named public and secret keys as one pair via pairedKeyId", async () => {
    const updates = stubKeyPair();

    const res = createResponse();
    await revokeUserApiKey(
      {
        body: { pairedKeyId: "public-key-id" },
        params: { keyId: "secret-key-id" },
        userId: "user-1"
      } as never,
      res as never
    );

    expect(res.statusCode).toBe(httpStatus.NO_CONTENT);
    expect(updates).toEqual(expectedPairUpdates);
  });

  it("still accepts the legacy publicKeyId alias", async () => {
    const updates = stubKeyPair(null, null);

    const res = createResponse();
    await revokeUserApiKey(
      {
        body: { publicKeyId: "public-key-id" },
        params: { keyId: "secret-key-id" },
        userId: "user-1"
      } as never,
      res as never
    );

    expect(res.statusCode).toBe(httpStatus.NO_CONTENT);
    expect(updates).toEqual(expectedPairUpdates);
  });

  it("rejects keys with different credential IDs", async () => {
    const updates = stubKeyPair("credential-1", "credential-2");

    const res = createResponse();
    await revokeUserApiKey(
      {
        body: { pairedKeyId: "public-key-id" },
        params: { keyId: "secret-key-id" },
        userId: "user-1"
      } as never,
      res as never
    );

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect((res.body as { error: { code: string } }).error.code).toBe("KEY_PAIR_MISMATCH");
    expect(updates).toEqual([]);
  });
});
