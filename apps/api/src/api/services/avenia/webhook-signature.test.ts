import { afterAll, beforeEach, describe, expect, it, mock, setSystemTime } from "bun:test";
import { keyServer, loggerModuleMock, pkcs1Keys, primaryKeys, rotatedKeys, sharedModuleMock, sign } from "./__tests__/fixtures";

mock.module("@vortexfi/shared", sharedModuleMock);
mock.module("../../../config/logger", loggerModuleMock);

const { REFRESH_COOLDOWN_MS, verifyAveniaSignature } = await import("./webhook-signature");

// The verifier keeps a cached key, a refresh cooldown and a TTL in module state, all read
// off the clock. Tests drive that clock rather than sleeping, and each one starts past the
// cooldown so a previous test's refresh cannot suppress this one's.
//
// It starts at the real current time on purpose: the other Avenia test file shares this
// module state, and a fixed past date would leave its refresh timestamps in the future,
// making the cooldown look permanently active.
let clock = new Date();

function advance(ms: number): void {
  clock = new Date(clock.getTime() + ms);
  setSystemTime(clock);
}

afterAll(() => {
  setSystemTime();
});

describe("verifyAveniaSignature", () => {
  beforeEach(() => {
    keyServer.servedKey = primaryKeys.publicKey;
    keyServer.calls = 0;
    advance(REFRESH_COOLDOWN_MS + 1);
  });

  it("accepts a body signed with Avenia's key", async () => {
    const body = Buffer.from(JSON.stringify({ data: { attempt: { id: "a-1" } }, subAccountId: "sub-1" }));

    expect(await verifyAveniaSignature(body, sign(body, primaryKeys.privateKey))).toBe(true);
  });

  it("accepts a key served in Avenia's PKCS#1 encoding", async () => {
    keyServer.servedKey = pkcs1Keys.publicKey;
    const body = Buffer.from(JSON.stringify({ data: { attempt: { id: "a-1" } }, subAccountId: "sub-1" }));

    expect(await verifyAveniaSignature(body, sign(body, pkcs1Keys.privateKey))).toBe(true);
  });

  it("rejects a signature from a foreign key", async () => {
    const body = Buffer.from(JSON.stringify({ subAccountId: "sub-1" }));

    expect(await verifyAveniaSignature(body, sign(body, rotatedKeys.privateKey))).toBe(false);
  });

  it("rejects a body altered after signing", async () => {
    const signature = sign(Buffer.from(JSON.stringify({ subAccountId: "sub-1" })), primaryKeys.privateKey);

    expect(await verifyAveniaSignature(Buffer.from(JSON.stringify({ subAccountId: "attacker" })), signature)).toBe(false);
  });

  it("rejects a malformed signature header", async () => {
    expect(await verifyAveniaSignature(Buffer.from("{}"), "not-base64-at-all!!")).toBe(false);
  });

  it("refetches the key so a rotation does not reject genuine events", async () => {
    const body = Buffer.from(JSON.stringify({ subAccountId: "sub-1" }));
    // Warm the cache with the pre-rotation key.
    await verifyAveniaSignature(body, sign(body, primaryKeys.privateKey));

    keyServer.servedKey = rotatedKeys.publicKey;
    advance(REFRESH_COOLDOWN_MS + 1);

    expect(await verifyAveniaSignature(body, sign(body, rotatedKeys.privateKey))).toBe(true);
  });

  it("does not fetch the key again for every forged body", async () => {
    const body = Buffer.from(JSON.stringify({ subAccountId: "sub-1" }));
    // Warm the cache so the forgeries below are misses against a fresh key, and clear the
    // cooldown that warm-up may have started so the burst begins with a refresh available.
    await verifyAveniaSignature(body, sign(body, primaryKeys.privateKey));
    advance(REFRESH_COOLDOWN_MS + 1);
    keyServer.calls = 0;

    const forged = sign(body, rotatedKeys.privateKey);
    for (let i = 0; i < 20; i += 1) {
      expect(await verifyAveniaSignature(body, forged)).toBe(false);
    }

    // One refetch for the whole burst: the rest are rejected inside the cooldown.
    expect(keyServer.calls).toBe(1);
  });

  it("coalesces concurrent refreshes into a single fetch", async () => {
    const body = Buffer.from(JSON.stringify({ subAccountId: "sub-1" }));
    // Expire the cached key so every one of these needs a key fetched.
    advance(2 * 60 * 60 * 1000);
    keyServer.calls = 0;

    const signature = sign(body, primaryKeys.privateKey);
    const results = await Promise.all(Array.from({ length: 5 }, () => verifyAveniaSignature(body, signature)));

    expect(results).toEqual([true, true, true, true, true]);
    expect(keyServer.calls).toBe(1);
  });
});
