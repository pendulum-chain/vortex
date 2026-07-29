import { beforeEach, describe, expect, it, mock } from "bun:test";
import { keyServer, loggerModuleMock, primaryKeys, rotatedKeys, sharedModuleMock, sign } from "./__tests__/fixtures";

mock.module("@vortexfi/shared", sharedModuleMock);
mock.module("../../../config/logger", loggerModuleMock);

const { verifyAveniaSignature } = await import("./webhook-signature");

describe("verifyAveniaSignature", () => {
  beforeEach(() => {
    keyServer.servedKey = primaryKeys.publicKey;
  });

  it("accepts a body signed with Avenia's key", async () => {
    const body = Buffer.from(JSON.stringify({ data: { attempt: { id: "a-1" } }, subAccountId: "sub-1" }));

    expect(await verifyAveniaSignature(body, sign(body, primaryKeys.privateKey))).toBe(true);
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

    expect(await verifyAveniaSignature(body, sign(body, rotatedKeys.privateKey))).toBe(true);
  });
});
