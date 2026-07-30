import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ApiKeyRecord } from "@/services/api/api-keys.service";
import { groupApiCredentials, keyPreview } from "./api-credentials";

function key(overrides: Partial<ApiKeyRecord> & Pick<ApiKeyRecord, "id" | "type">): ApiKeyRecord {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    credentialId: "credential-1",
    expiresAt: "2027-01-01T00:00:00.000Z",
    isActive: true,
    keyPrefix: overrides.type === "public" ? "pk_live_" : "sk_live_",
    lastUsedAt: null,
    name: `Production (${overrides.type === "public" ? "Public" : "Secret"})`,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("groupApiCredentials", () => {
  it("groups public and secret records by credential ID even when names are duplicated", () => {
    const records = [
      key({ id: "public-1", key: "pk_live_abcdefghijklmnopqrstuvwxyz123456", type: "public" }),
      key({ id: "secret-1", type: "secret" }),
      key({ credentialId: "credential-2", id: "public-2", type: "public" }),
      key({ credentialId: "credential-2", id: "secret-2", type: "secret" })
    ];

    const credentials = groupApiCredentials(records);

    assert.equal(credentials.length, 2);
    assert.equal(credentials[0]?.publicKey?.id, "public-1");
    assert.equal(credentials[0]?.secretKey?.id, "secret-1");
    assert.equal(credentials[1]?.publicKey?.id, "public-2");
    assert.equal(credentials[1]?.secretKey?.id, "secret-2");
  });

  it("keeps unpaired legacy records separate rather than matching by name", () => {
    const records = [
      key({ credentialId: null, id: "legacy-public", type: "public" }),
      key({ credentialId: null, id: "legacy-secret", type: "secret" })
    ];

    const credentials = groupApiCredentials(records);

    assert.equal(credentials.length, 2);
    assert.ok(credentials.every(credential => credential.isLegacy));
  });

  it("masks public keys while retaining a useful preview", () => {
    const publicKey = key({ id: "public-1", key: "pk_live_abcdefghijklmnopqrstuvwxyz123456", type: "public" });
    assert.equal(keyPreview(publicKey), "pk_live_abcd••••3456");
  });
});
