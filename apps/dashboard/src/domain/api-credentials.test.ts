import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ApiCredentialRecord } from "@/services/api/api-credentials.service";
import { credentialStatus, keyPreview, toApiCredentials } from "./api-credentials";

function credential(overrides: Partial<ApiCredentialRecord> = {}): ApiCredentialRecord {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    environment: "live",
    expiresAt: "2027-01-01T00:00:00.000Z",
    id: "credential-1",
    name: "Production",
    partnerId: "partner-1",
    profileId: "profile-1",
    publicKey: "pk_live_abcdefghijklmnopqrstuvwxyz123456",
    publicLastUsedAt: null,
    revokedAt: null,
    secretKeyPrefix: "sk_live_",
    secretLastUsedAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("credentialStatus", () => {
  const now = new Date("2026-07-31T00:00:00.000Z");

  it("derives active and expired status from the expiration date", () => {
    assert.equal(credentialStatus(credential(), now), "active");
    assert.equal(credentialStatus(credential({ expiresAt: "2026-07-30T00:00:00.000Z" }), now), "expired");
  });

  it("gives revoked status precedence over expiration", () => {
    const record = credential({ expiresAt: "2026-01-02T00:00:00.000Z", revokedAt: "2026-01-01T00:00:00.000Z" });
    assert.equal(credentialStatus(record, now), "revoked");
  });
});

describe("toApiCredentials", () => {
  it("maps direct credential records and sorts newest first", () => {
    const records = [
      credential(),
      credential({ createdAt: "2026-02-01T00:00:00.000Z", id: "credential-2", name: "Staging" })
    ];

    const credentials = toApiCredentials(records, new Date("2026-07-31T00:00:00.000Z"));

    assert.deepEqual(
      credentials.map(item => item.id),
      ["credential-2", "credential-1"]
    );
    assert.equal(credentials[0]?.publicKey, records[1]?.publicKey);
  });

  it("masks public keys while retaining a useful preview", () => {
    assert.equal(keyPreview(credential().publicKey), "pk_live_abcd••••3456");
  });
});
