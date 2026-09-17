import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import express from "express";
import { config } from "../../../config/vars";
import KycCase from "../../../models/kycCase.model";
import ManagedProfile from "../../../models/managedProfile.model";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import ProviderCustomer, { VerificationStatus } from "../../../models/providerCustomer.model";
import User from "../../../models/user.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import moneriumB2bRoutes from "../../routes/v1/admin/monerium-b2b.route";
import { forwarderConfigMismatch } from "../../services/monerium-b2b/account-provisioning";

const BASE_PATH = "/v1/admin/monerium-b2b";
const ADMIN_HEADERS = { Authorization: "Bearer test-admin-secret", "Content-Type": "application/json" };

const FORWARDER = "0x1111111111111111111111111111111111111111";
const DESTINATION = "0x2222222222222222222222222222222222222222";
const FACTORY = "0x4444444444444444444444444444444444444444";

describe("monerium b2b account mapping admin route", () => {
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;
  let originalRpcUrl: string | undefined;

  beforeAll(async () => {
    originalRpcUrl = config.moneriumB2b.rpcUrl;
    config.moneriumB2b.rpcUrl = undefined;
    await setupTestDatabase();

    const app = express();
    app.use(express.json());
    app.use(BASE_PATH, moneriumB2bRoutes);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind test server");
    baseUrl = `http://127.0.0.1:${address.port}${BASE_PATH}`;
  });

  afterAll(() => {
    config.moneriumB2b.rpcUrl = originalRpcUrl;
    server?.close();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  async function createManager(): Promise<string> {
    const profile = await createTestUser();
    await ManagedProfileManager.create({
      allowedCorridors: ["EU"],
      allowedCustomerTypes: ["business"],
      isActive: true,
      profileId: profile.id
    });
    return profile.id;
  }

  function post(body: unknown, headers: Record<string, string> = ADMIN_HEADERS) {
    return fetch(`${baseUrl}/accounts`, { body: JSON.stringify(body), headers, method: "POST" });
  }

  function validBody(managerProfileId: string, overrides: Record<string, unknown> = {}) {
    return {
      contactEmail: "ops@client.example.com",
      destination: DESTINATION,
      externalSubjectId: "client-1",
      forwarderAddress: FORWARDER,
      managerProfileId,
      moneriumProfileId: "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e",
      ...overrides
    };
  }

  it("requires admin authentication", async () => {
    const response = await post(validBody(crypto.randomUUID()), { "Content-Type": "application/json" });
    expect(response.status).toBe(401);
  });

  it("provisions the managed child, KYB mirror, and account", async () => {
    const managerProfileId = await createManager();

    const response = await post(validBody(managerProfileId));
    expect(response.status).toBe(201);
    const { account } = await response.json();
    expect(account).toMatchObject({
      accountStatus: MoneriumAccountStatus.Onboarding,
      created: true,
      iban: null,
      moneriumProfileId: "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e"
    });

    const child = await User.findByPk(account.profileId);
    expect(child?.kind).toBe("managed");
    expect(child?.email).toBeNull();

    const relationship = await ManagedProfile.findOne({ where: { profileId: account.profileId } });
    expect(relationship).toMatchObject({
      creationSource: "vortex",
      externalSubjectId: "client-1",
      managerProfileId,
      status: "active"
    });

    const customer = await ProviderCustomer.findOne({ where: { customerEntityId: account.customerEntityId } });
    expect(customer).toMatchObject({
      customerType: "business",
      provider: "monerium",
      providerCustomerId: "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e",
      rail: "eur",
      status: VerificationStatus.Approved
    });

    const kycCase = await KycCase.findOne({ where: { providerCustomerId: customer?.id } });
    expect(kycCase).toMatchObject({ status: VerificationStatus.Approved, type: "kyb" });
    expect(kycCase?.approvedAt).not.toBeNull();

    const row = await MoneriumAccount.findByPk(account.accountId);
    expect(row).toMatchObject({
      destination: DESTINATION,
      floorPpm: 1500,
      forwarderAddress: FORWARDER,
      targetPpm: 1250,
      vortexProfileId: account.profileId
    });
  });

  it("is idempotent for an identical replay", async () => {
    const managerProfileId = await createManager();

    const first = await post(validBody(managerProfileId));
    expect(first.status).toBe(201);
    const replay = await post(validBody(managerProfileId));
    expect(replay.status).toBe(200);
    const { account } = await replay.json();
    expect(account.created).toBe(false);

    expect(await MoneriumAccount.count()).toBe(1);
    expect(await ManagedProfile.count()).toBe(1);
    expect(await ProviderCustomer.count()).toBe(1);
    expect(await KycCase.count()).toBe(1);
  });

  it("adopts a pre-mapping account row that matches the deployed forwarder", async () => {
    const managerProfileId = await createManager();
    await MoneriumAccount.create({
      destination: DESTINATION,
      forwarderAddress: FORWARDER,
      profileId: "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e"
    });

    const response = await post(validBody(managerProfileId));
    expect(response.status).toBe(200);
    const { account } = await response.json();
    expect(account.created).toBe(false);

    const row = await MoneriumAccount.findByPk(account.accountId);
    expect(row?.vortexProfileId).toBe(account.profileId);
  });

  it("rejects a divergent replay instead of overwriting", async () => {
    const managerProfileId = await createManager();
    expect((await post(validBody(managerProfileId))).status).toBe(201);

    // Same Monerium profile, different forwarder.
    const differentForwarder = await post(
      validBody(managerProfileId, { forwarderAddress: "0x4444444444444444444444444444444444444444" })
    );
    expect(differentForwarder.status).toBe(409);
    expect(await differentForwarder.json()).toMatchObject({ error: { code: "MONERIUM_B2B_ACCOUNT_CONFLICT" } });

    // Same child, different Monerium profile.
    const differentMonerium = await post(
      validBody(managerProfileId, { moneriumProfileId: "9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f" })
    );
    expect(differentMonerium.status).toBe(409);

    // Different subject claiming the same Monerium profile.
    const differentSubject = await post(
      validBody(managerProfileId, {
        contactEmail: "other@client.example.com",
        externalSubjectId: "client-2",
        forwarderAddress: "0x5555555555555555555555555555555555555555"
      })
    );
    expect(differentSubject.status).toBe(409);

    // Same everything, different fee policy: divergence, not a silent idempotent replay.
    const differentFee = await post(validBody(managerProfileId, { targetPpm: 1_000 }));
    expect(differentFee.status).toBe(409);

    expect(await MoneriumAccount.count()).toBe(1);
    expect(await ManagedProfile.count()).toBe(1);
    expect(await ProviderCustomer.count()).toBe(1);
    expect(await KycCase.count()).toBe(1);
    expect(await User.count()).toBe(2);
  });

  it("compares submitted account data against the deployed clone config", () => {
    const expected = {
      destination: DESTINATION.toLowerCase(),
      factory: FACTORY.toLowerCase(),
      floorPpm: 1500,
      targetPpm: 1250
    };
    const matching = {
      destination: DESTINATION,
      factory: FACTORY,
      floorPpm: 1500,
      isForwarder: true,
      targetPpm: 1250
    };

    expect(forwarderConfigMismatch(expected, matching)).toBeNull();
    expect(forwarderConfigMismatch(expected, { ...matching, factory: FORWARDER })).toContain("trusted factory");
    expect(forwarderConfigMismatch(expected, { ...matching, isForwarder: false })).toContain("not a clone");
    expect(
      forwarderConfigMismatch(expected, { ...matching, destination: "0x3333333333333333333333333333333333333333" })
    ).toContain("destination");
    expect(forwarderConfigMismatch(expected, { ...matching, targetPpm: 1_000 })).toContain("targetPpm");
    expect(forwarderConfigMismatch(expected, { ...matching, floorPpm: 2_000 })).toContain("floorPpm");
  });

  it("rejects invalid input and unknown managers", async () => {
    const managerProfileId = await createManager();

    for (const overrides of [
      { forwarderAddress: "not-an-address" },
      { destination: "0x12345" },
      { moneriumProfileId: "not-a-uuid" },
      { targetPpm: 3.5 },
      { floorPpm: -1 },
      { floorPpm: 10_001 },
      { floorPpm: 1_000, targetPpm: 1_200 },
      { externalSubjectId: "" },
      { contactEmail: "not-an-email" }
    ]) {
      const response = await post(validBody(managerProfileId, overrides));
      expect(response.status).toBe(400);
    }
    expect(await MoneriumAccount.count()).toBe(0);

    const unknownManager = await post(validBody(crypto.randomUUID()));
    expect(unknownManager.status).toBe(404);
    expect(await unknownManager.json()).toMatchObject({ error: { code: "MANAGED_PROFILE_MANAGER_NOT_FOUND" } });
  });

  it("updates account status with the IBAN activation guard", async () => {
    const managerProfileId = await createManager();
    const created = await post(validBody(managerProfileId));
    const { account } = await created.json();

    function patchStatus(accountId: string, status: unknown) {
      return fetch(`${baseUrl}/accounts/${accountId}/status`, {
        body: JSON.stringify({ status }),
        headers: ADMIN_HEADERS,
        method: "PATCH"
      });
    }

    // No IBAN yet: activation is refused, other transitions work.
    const premature = await patchStatus(account.accountId, "active");
    expect(premature.status).toBe(409);
    expect(await premature.json()).toMatchObject({ error: { code: "MONERIUM_B2B_ACCOUNT_NOT_READY" } });

    await MoneriumAccount.update({ iban: "EE08 7224 5745 6244 9516" }, { where: { id: account.accountId } });
    const activated = await patchStatus(account.accountId, "active");
    expect(activated.status).toBe(200);
    expect(await activated.json()).toMatchObject({ account: { accountStatus: "active" } });

    const suspended = await patchStatus(account.accountId, "suspended");
    expect(suspended.status).toBe(200);

    // Re-activation after a suspension keeps the IBAN guard satisfied.
    const reactivated = await patchStatus(account.accountId, "active");
    expect(reactivated.status).toBe(200);
    expect(await reactivated.json()).toMatchObject({ account: { accountStatus: "active" } });

    const regressed = await patchStatus(account.accountId, "onboarding");
    expect(regressed.status).toBe(409);
    expect(await regressed.json()).toMatchObject({ error: { code: "MONERIUM_B2B_INVALID_STATUS_TRANSITION" } });

    const closed = await patchStatus(account.accountId, "closed");
    expect(closed.status).toBe(200);
    expect((await patchStatus(account.accountId, "closed")).status).toBe(200);
    for (const invalidStatus of ["active", "onboarding", "suspended"]) {
      const reopened = await patchStatus(account.accountId, invalidStatus);
      expect(reopened.status).toBe(409);
      expect(await reopened.json()).toMatchObject({ error: { code: "MONERIUM_B2B_INVALID_STATUS_TRANSITION" } });
    }
    expect((await MoneriumAccount.findByPk(account.accountId))?.status).toBe(MoneriumAccountStatus.Closed);

    expect((await patchStatus(account.accountId, "nonsense")).status).toBe(400);
    expect((await patchStatus(crypto.randomUUID(), "active")).status).toBe(404);
  });

  it("marks a settling deposit for recovery and lets an operator close or retry it", async () => {
    const managerProfileId = await createManager();
    const created = await post(validBody(managerProfileId));
    const { account } = (await created.json()) as { account: { accountId: string } };
    const deposit = await MoneriumFiatDeposit.create({
      accountId: account.accountId,
      amountRaw: "100000000000000000000",
      blockNumber: 100,
      chainId: 11155111,
      currency: "eur",
      logIndex: 1,
      moneriumOrderId: "order-1",
      status: MoneriumFiatDepositStatus.Converting,
      txHash: "0xmint"
    });
    const recover = (depositId: string) =>
      fetch(`${baseUrl}/deposits/${depositId}/recover`, { headers: ADMIN_HEADERS, method: "POST" });
    const patchStatus = (depositId: string, status: unknown) =>
      fetch(`${baseUrl}/deposits/${depositId}/status`, {
        body: JSON.stringify({ status }),
        headers: ADMIN_HEADERS,
        method: "PATCH"
      });

    // A pending keeper transaction must settle first: the amounts to recover depend on it.
    const pending = await MoneriumConversionExecution.create({
      accountId: account.accountId,
      depositId: deposit.id,
      destination: DESTINATION,
      eureInRaw: "60000000000000000000",
      status: MoneriumConversionExecutionStatus.Pending
    });
    const blocked = await recover(deposit.id);
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ error: { message: expect.stringContaining("pending execution") } });
    await pending.update({ status: MoneriumConversionExecutionStatus.Failed });

    const marked = await recover(deposit.id);
    expect(marked.status).toBe(200);
    expect(await marked.json()).toMatchObject({ deposit: { depositId: deposit.id, status: "recovering" } });
    expect((await MoneriumFiatDeposit.findByPk(deposit.id))?.status).toBe(MoneriumFiatDepositStatus.Recovering);

    // Forward-only: a recovering deposit cannot be marked again, but closes or retries.
    expect((await recover(deposit.id)).status).toBe(409);
    expect((await patchStatus(deposit.id, "forwarded")).status).toBe(400);
    const failed = await patchStatus(deposit.id, "recovery_failed");
    expect(failed.status).toBe(200);
    const retried = await patchStatus(deposit.id, "recovering");
    expect(retried.status).toBe(200);
    const refunded = await patchStatus(deposit.id, "refunded");
    expect(refunded.status).toBe(200);
    expect((await patchStatus(deposit.id, "recovering")).status).toBe(409);
    expect((await MoneriumFiatDeposit.findByPk(deposit.id))?.status).toBe(MoneriumFiatDepositStatus.Refunded);

    expect((await recover(crypto.randomUUID())).status).toBe(404);
    expect((await recover("not-a-uuid")).status).toBe(400);
  });

  it("refuses managers not allowed to provision business customers", async () => {
    const profile = await createTestUser();
    await ManagedProfileManager.create({
      allowedCorridors: ["BR"],
      allowedCustomerTypes: ["individual"],
      isActive: true,
      profileId: profile.id
    });

    const response = await post(validBody(profile.id));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "MANAGED_PROFILE_INVALID_INPUT" } });
    expect(await MoneriumAccount.count()).toBe(0);
  });
});
