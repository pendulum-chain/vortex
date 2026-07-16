import { afterEach, describe, expect, it, mock } from "bun:test";
import httpStatus from "http-status";
import ApiKey from "../../models/apiKey.model";
import { createUserApiKey, MAX_ACTIVE_KEYS_PER_USER, revokeUserApiKey } from "./userApiKeys.controller";

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

  afterEach(() => {
    ApiKey.count = originalCount;
  });

  it("rejects creation with 409 when the per-user active key cap is reached", async () => {
    ApiKey.count = mock(async () => MAX_ACTIVE_KEYS_PER_USER) as unknown as typeof ApiKey.count;

    const res = createResponse();
    await createUserApiKey({ body: {}, userId: "user-1" } as never, res as never);

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect((res.body as { error: { code: string } }).error.code).toBe("API_KEY_LIMIT_REACHED");
  });
});

describe("revokeUserApiKey", () => {
  const originalFindOne = ApiKey.findOne;

  afterEach(() => {
    ApiKey.findOne = originalFindOne;
  });

  function stubKeyPair() {
    const updates: Array<{ id: string; changes: unknown }> = [];
    const secretKey = {
      id: "secret-key-id",
      keyType: "secret",
      name: "Secret Key",
      update: mock(async (changes: unknown) => {
        updates.push({ changes, id: "secret-key-id" });
      })
    };
    const publicKey = {
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
    const updates = stubKeyPair();

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
});
