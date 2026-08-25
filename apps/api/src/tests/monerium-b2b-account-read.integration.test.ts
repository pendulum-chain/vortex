import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { CorridorCountry } from "@vortexfi/shared";
import ManagedProfileManager from "../models/managedProfileManager.model";
import MoneriumConversionExecution, { MoneriumConversionExecutionStatus } from "../models/moneriumConversionExecution.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../models/moneriumFiatDeposit.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestApiKey, createTestUser } from "../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../test-utils/fake-world";
import { startTestApp, type TestApp } from "../test-utils/test-app";
import { provisionMoneriumB2bAccount } from "../api/services/monerium-b2b/account-provisioning";

const FORWARDER = "0x1111111111111111111111111111111111111111";
const DESTINATION = "0x2222222222222222222222222222222222222222";
const FALLBACK = "0x3333333333333333333333333333333333333333";
const MONERIUM_PROFILE = "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e";

describe("monerium b2b account read surface", () => {
  let app: TestApp;
  let world: FakeWorld;

  beforeAll(async () => {
    world = installFakeWorld();
    await setupTestDatabase();
    app = await startTestApp();
  });

  afterAll(async () => {
    await app?.close();
    world?.restore();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  async function jsonRequest(path: string, headers: Record<string, string>): Promise<{ body: Record<string, unknown>; status: number }> {
    const response = await app.request(path, { headers, method: "GET" });
    const text = await response.text();
    return { body: text ? (JSON.parse(text) as Record<string, unknown>) : {}, status: response.status };
  }

  async function setupMappedChild(corridors: CorridorCountry[] = ["EU"]) {
    const manager = await createTestUser();
    await ManagedProfileManager.create({
      allowedCorridors: corridors,
      allowedCustomerTypes: ["business"],
      isActive: true,
      profileId: manager.id
    });
    const managerCredential = await createTestApiKey({ userId: manager.id });
    const mapped = await provisionMoneriumB2bAccount({
      contactEmail: "ops@client.example.com",
      destination: DESTINATION,
      externalSubjectId: "client-1",
      fallbackAddress: FALLBACK,
      forwarderAddress: FORWARDER,
      managerProfileId: manager.id,
      moneriumProfileId: MONERIUM_PROFILE
    });
    return {
      delegatedHeaders: { "X-API-Key": managerCredential.plaintextKey, "X-Managed-Profile-Id": mapped.profileId },
      managerHeaders: { "X-API-Key": managerCredential.plaintextKey },
      mapped
    };
  }

  it("returns the acting child's account and deposit history with conversion status", async () => {
    const { delegatedHeaders, mapped } = await setupMappedChild();

    const account = await jsonRequest("/v1/monerium-b2b/account", delegatedHeaders);
    expect(account.status).toBe(200);
    expect(account.body.account).toMatchObject({
      accountId: mapped.accountId,
      destination: DESTINATION,
      fallbackAddress: FALLBACK,
      feeBps: 0,
      forwarderAddress: FORWARDER,
      iban: null,
      status: "onboarding"
    });

    const execution = await MoneriumConversionExecution.create({
      accountId: mapped.accountId,
      destination: DESTINATION,
      eureInRaw: "100000000000000000000",
      status: MoneriumConversionExecutionStatus.Confirmed,
      txHash: "0xswap",
      usdcNetRaw: "108000000"
    });
    await MoneriumFiatDeposit.create({
      accountId: mapped.accountId,
      currency: "eur",
      allocatedExecutionId: execution.id,
      amountRaw: "100000000000000000000",
      moneriumOrderId: "order-1",
      status: MoneriumFiatDepositStatus.Minted,
      txHash: "0xmint"
    });
    await MoneriumFiatDeposit.create({
      accountId: mapped.accountId,
      currency: "eur",
      amountRaw: "50000000000000000000",
      moneriumOrderId: "order-2",
      status: MoneriumFiatDepositStatus.Pending
    });
    // R09 synthetic unattributed inflow: ops-only, must never appear in the API.
    await MoneriumFiatDeposit.create({
      accountId: mapped.accountId,
      currency: "eur",
      amountRaw: "1000000000000000000",
      moneriumOrderId: "unattr:1:0xdead:0",
      status: MoneriumFiatDepositStatus.Minted
    });

    const deposits = await jsonRequest("/v1/monerium-b2b/deposits", delegatedHeaders);
    expect(deposits.status).toBe(200);
    const rows = deposits.body.deposits as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.status)).toEqual(["pending", "minted"]);
    expect(rows[1]).toMatchObject({
      amountRaw: "100000000000000000000",
      conversion: { executionId: execution.id, status: "confirmed", txHash: "0xswap", usdcNetRaw: "108000000" },
      txHash: "0xmint"
    });
    expect(rows[0].conversion).toBeNull();
    expect(deposits.body.pagination).toMatchObject({ total: 2 });
  });

  it("rejects delegation for a manager without the EU corridor", async () => {
    const { delegatedHeaders } = await setupMappedChild(["BR"]);
    const response = await jsonRequest("/v1/monerium-b2b/account", delegatedHeaders);
    expect(response.status).toBe(403);
  });

  it("rejects a foreign manager and unauthenticated callers", async () => {
    const { mapped } = await setupMappedChild();

    const stranger = await createTestUser();
    await ManagedProfileManager.create({
      allowedCorridors: ["EU"],
      allowedCustomerTypes: ["business"],
      isActive: true,
      profileId: stranger.id
    });
    const strangerCredential = await createTestApiKey({ userId: stranger.id });
    const foreign = await jsonRequest("/v1/monerium-b2b/account", {
      "X-API-Key": strangerCredential.plaintextKey,
      "X-Managed-Profile-Id": mapped.profileId
    });
    expect(foreign.status).toBe(403);

    const unauthenticated = await app.request("/v1/monerium-b2b/account", { method: "GET" });
    expect(unauthenticated.status).toBe(401);
  });

  it("returns 404 for an authenticated profile without a mapped account", async () => {
    const { managerHeaders } = await setupMappedChild();
    const response = await jsonRequest("/v1/monerium-b2b/account", managerHeaders);
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "MONERIUM_B2B_ACCOUNT_NOT_FOUND" } });
  });
});
