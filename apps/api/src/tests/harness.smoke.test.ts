import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { installFakeWorld, type FakeWorld } from "../test-utils/fake-world";
import { setupTestDatabase, truncateAllTables } from "../test-utils/db";
import { createTestApiKey, createTestPartner, createTestQuote, createTestRampState, createTestUser } from "../test-utils/factories";
import { startTestApp, type TestApp } from "../test-utils/test-app";

describe("test harness smoke test", () => {
  let world: FakeWorld;
  let app: TestApp;

  beforeAll(async () => {
    world = installFakeWorld();
    await setupTestDatabase();
    await truncateAllTables();
    app = await startTestApp();
  });

  afterAll(async () => {
    await app?.close();
    world?.restore();
  });

  it("boots the real Express app and serves a public endpoint", async () => {
    const response = await app.request("/v1/supported-fiat-currencies");
    expect(response.status).toBe(200);
  });

  it("persists factory-built entities against the migrated schema", async () => {
    const user = await createTestUser();
    const partner = await createTestPartner();
    const { record, plaintextKey } = await createTestApiKey({ partnerName: partner.name });
    const quote = await createTestQuote({ userId: user.id });
    const ramp = await createTestRampState({ quoteId: quote.id, userId: user.id });

    expect(user.id).toBeTruthy();
    expect(record.keyPrefix).toBe(plaintextKey.slice(0, 8));
    expect(quote.status).toBe("pending");
    expect(ramp.currentPhase).toBe("initial");
  });

  it("blocks un-faked external HTTP calls", async () => {
    await expect(fetch("https://example.com")).rejects.toThrow(/Hermetic test violation/);
  });

  it("answers EVM balance reads from the in-memory ledger", async () => {
    const { EvmClientManager, Networks } = await import("@vortexfi/shared");
    const holder = "0x30a300612ab372CC73e53ffE87fB73d62Ed68Da3";
    const token = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    world.evm.setErc20Balance(Networks.Base, token, holder, 123n);

    const manager = EvmClientManager.getInstance();
    const balance = await manager.readContractWithRetry(Networks.Base, {
      abi: [],
      address: token,
      args: [holder],
      functionName: "balanceOf"
    });
    expect(balance).toBe(123n);
  });
});
