import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import express from "express";
import KycCase from "../../../models/kycCase.model";
import ManagedProfile from "../../../models/managedProfile.model";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import ProviderCustomer, { VerificationStatus } from "../../../models/providerCustomer.model";
import User from "../../../models/user.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import moneriumB2bRoutes from "../../routes/v1/admin/monerium-b2b.route";

const BASE_PATH = "/v1/admin/monerium-b2b";
const ADMIN_HEADERS = { Authorization: "Bearer test-admin-secret", "Content-Type": "application/json" };

const FORWARDER = "0x1111111111111111111111111111111111111111";
const DESTINATION = "0x2222222222222222222222222222222222222222";
const FALLBACK = "0x3333333333333333333333333333333333333333";

describe("monerium b2b account mapping admin route", () => {
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;

  beforeAll(async () => {
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
      fallbackAddress: FALLBACK,
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
      fallbackAddress: FALLBACK,
      feeBps: 0,
      forwarderAddress: FORWARDER,
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
      fallbackAddress: FALLBACK,
      feeBps: 0,
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

    expect(await MoneriumAccount.count()).toBe(1);
  });

  it("rejects invalid input and unknown managers", async () => {
    const managerProfileId = await createManager();

    for (const overrides of [
      { forwarderAddress: "not-an-address" },
      { destination: "0x12345" },
      { fallbackAddress: "" },
      { moneriumProfileId: "not-a-uuid" },
      { feeBps: 3.5 },
      { feeBps: -1 },
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
