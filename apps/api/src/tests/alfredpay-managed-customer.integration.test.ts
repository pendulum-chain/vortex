import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { AlfredPayStatus, AlfredpayApiService, AlfredpayCustomerType } from "@vortexfi/shared";
import express from "express";
import sequelize from "../config/database";
import CustomerEntity from "../models/customerEntity.model";
import ManagedProfile from "../models/managedProfile.model";
import ManagedProfileManager from "../models/managedProfileManager.model";
import ProviderCustomer from "../models/providerCustomer.model";
import User from "../models/user.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestApiKey, createTestUser } from "../test-utils/factories";
import alfredpayRoutes from "../api/routes/v1/alfredpay.route";
import { SupabaseAuthService } from "../api/services/auth";
import { createAlfredpayCustomer } from "../api/services/alfredpay/alfredpay-customer.service";
import { createManagedProfileCredential } from "../api/services/apiCredential.service";
import { provisionManagedProfile } from "../api/services/managed-profile-provisioning.service";

const BASE_PATH = "/v1/alfredpay";
const originalGetInstance = AlfredpayApiService.getInstance;
const originalVerifyToken = SupabaseAuthService.verifyToken;

describe("managed Alfredpay customer creation", () => {
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    await setupTestDatabase();
    const app = express();
    app.use(express.json());
    app.use(BASE_PATH, alfredpayRoutes);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind test server");
    baseUrl = `http://127.0.0.1:${address.port}${BASE_PATH}`;
  });

  afterAll(() => server?.close());
  beforeEach(resetTestDatabase);
  afterEach(() => {
    AlfredpayApiService.getInstance = originalGetInstance;
    SupabaseAuthService.verifyToken = originalVerifyToken;
  });

  async function createManager(
    allowedCorridors = ["MX"] as Array<"AR" | "CO" | "MX" | "US">,
    allowedCustomerTypes: Array<"business" | "individual"> | null = null
  ) {
    const manager = await createTestUser({ email: "manager@example.com" });
    await ManagedProfileManager.create({ allowedCorridors, allowedCustomerTypes, isActive: true, profileId: manager.id });
    return manager;
  }

  async function createChild(managerProfileId: string, customerType: "business" | "individual", contactEmail: string) {
    return provisionManagedProfile({
      contactEmail,
      creationSource: "manager",
      customerType,
      externalSubjectId: crypto.randomUUID(),
      managerProfileId
    });
  }

  function provider(createCustomer: ReturnType<typeof mock>, findCustomer?: ReturnType<typeof mock>) {
    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          createCustomer,
          findCustomer: findCustomer ?? mock(() => {
            throw new Error("findCustomer should not be called");
          })
        }) as unknown as AlfredpayApiService
    );
  }

  it("uses the child contact email, never the Supabase manager email", async () => {
    const manager = await createManager();
    const child = await createChild(manager.id, "individual", "child@example.com");
    SupabaseAuthService.verifyToken = mock(async () => ({
      email: "manager@example.com",
      user_id: manager.id,
      valid: true
    }));
    const createCustomer = mock(async () => ({ customerId: "alfred-child", createdAt: new Date().toISOString() }));
    provider(createCustomer);

    const response = await fetch(`${baseUrl}/createIndividualCustomer`, {
      body: JSON.stringify({ country: "MX" }),
      headers: {
        Authorization: "Bearer manager-token",
        "Content-Type": "application/json",
        "X-Managed-Profile-Id": child.profileId
      },
      method: "POST"
    });

    expect(response.status).toBe(200);
    expect(createCustomer).toHaveBeenCalledWith("child@example.com", AlfredpayCustomerType.INDIVIDUAL, "MX");
    expect(JSON.stringify(createCustomer.mock.calls)).not.toContain("manager@example.com");
    expect((await User.findByPk(child.profileId))?.email).toBeNull();
  });

  it("preserves ordinary Supabase profile customer creation", async () => {
    const user = await createTestUser({ email: "ordinary@example.com" });
    SupabaseAuthService.verifyToken = mock(async () => ({
      email: "ordinary@example.com",
      user_id: user.id,
      valid: true
    }));
    const createCustomer = mock(async () => ({ customerId: "alfred-ordinary", createdAt: new Date().toISOString() }));
    provider(createCustomer);

    const response = await fetch(`${baseUrl}/createIndividualCustomer`, {
      body: JSON.stringify({ country: "MX" }),
      headers: { Authorization: "Bearer user-token", "Content-Type": "application/json" },
      method: "POST"
    });

    expect(response.status).toBe(200);
    expect(createCustomer).toHaveBeenCalledWith("ordinary@example.com", AlfredpayCustomerType.INDIVIDUAL, "MX");
  });

  it("allows manager secret delegation for business creation", async () => {
    const manager = await createManager(["CO"]);
    const child = await createChild(manager.id, "business", "business@example.com");
    const credential = await createTestApiKey({ userId: manager.id });
    const createCustomer = mock(async () => ({ customerId: "alfred-business", createdAt: new Date().toISOString() }));
    provider(createCustomer);

    const response = await fetch(`${baseUrl}/createBusinessCustomer`, {
      body: JSON.stringify({ country: "CO" }),
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": credential.plaintextKey,
        "X-Managed-Profile-Id": child.profileId
      },
      method: "POST"
    });

    expect(response.status).toBe(200);
    expect(createCustomer).toHaveBeenCalledWith("business@example.com", AlfredpayCustomerType.BUSINESS, "CO");
  });

  it("rejects the wrong child type and disallowed corridor before provider access", async () => {
    const manager = await createManager();
    const child = await createChild(manager.id, "individual", "child@example.com");
    const credential = await createTestApiKey({ userId: manager.id });
    const createCustomer = mock(async () => ({ customerId: "unexpected", createdAt: new Date().toISOString() }));
    provider(createCustomer);
    const headers = {
      "Content-Type": "application/json",
      "X-API-Key": credential.plaintextKey,
      "X-Managed-Profile-Id": child.profileId
    };

    expect(
      (await fetch(`${baseUrl}/createBusinessCustomer`, { body: JSON.stringify({ country: "MX" }), headers, method: "POST" }))
        .status
    ).toBe(400);
    expect(
      (await fetch(`${baseUrl}/createIndividualCustomer`, { body: JSON.stringify({ country: "US" }), headers, method: "POST" }))
        .status
    ).toBe(403);
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("enforces manager customer-type narrowing before provider access", async () => {
    const manager = await createManager(["MX"], ["individual"]);
    const child = await createChild(manager.id, "business", "business@example.com");
    const credential = await createTestApiKey({ userId: manager.id });
    const createCustomer = mock(async () => ({ customerId: "unexpected", createdAt: new Date().toISOString() }));
    provider(createCustomer);

    const response = await fetch(`${baseUrl}/createBusinessCustomer`, {
      body: JSON.stringify({ country: "MX" }),
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": credential.plaintextKey,
        "X-Managed-Profile-Id": child.profileId
      },
      method: "POST"
    });

    expect(response.status).toBe(403);
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("rejects AR business through the canonical matrix before provider access", async () => {
    const manager = await createManager(["AR"]);
    const child = await createChild(manager.id, "business", "business-ar@example.com");
    const credential = await createTestApiKey({ userId: manager.id });
    const createCustomer = mock(async () => ({ customerId: "unexpected", createdAt: new Date().toISOString() }));
    provider(createCustomer);

    const response = await fetch(`${baseUrl}/createBusinessCustomer`, {
      body: JSON.stringify({ country: "AR" }),
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": credential.plaintextKey,
        "X-Managed-Profile-Id": child.profileId
      },
      method: "POST"
    });

    expect(response.status).toBe(403);
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("applies policy updates to direct child credentials before provider access", async () => {
    const manager = await createManager(["MX"], ["business"]);
    const child = await createChild(manager.id, "business", "direct-business@example.com");
    const credential = await createManagedProfileCredential({
      environment: "test",
      managerProfileId: manager.id,
      profileId: child.profileId
    });
    await ManagedProfileManager.update(
      { allowedCustomerTypes: ["individual"] },
      { where: { profileId: manager.id } }
    );
    const createCustomer = mock(async () => ({ customerId: "unexpected", createdAt: new Date().toISOString() }));
    provider(createCustomer);

    const response = await fetch(`${baseUrl}/createBusinessCustomer`, {
      body: JSON.stringify({ country: "MX" }),
      headers: { "Content-Type": "application/json", "X-API-Key": credential.secretKey },
      method: "POST"
    });

    expect(response.status).toBe(403);
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("checks multipart entity type before buffering and country policy after parsing", async () => {
    const manager = await createManager(["MX"], ["business"]);
    const child = await createChild(manager.id, "business", "multipart-business@example.com");
    const credential = await createTestApiKey({ userId: manager.id });
    const createCustomer = mock(async () => ({ customerId: "unexpected", createdAt: new Date().toISOString() }));
    provider(createCustomer);
    const form = new FormData();
    form.set("country", "MX");
    form.set("file", new Blob(["document"]), "document.pdf");

    const response = await fetch(`${baseUrl}/submitKycFile`, {
      body: form,
      headers: { "X-API-Key": credential.plaintextKey, "X-Managed-Profile-Id": child.profileId },
      method: "POST"
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "MANAGED_PROFILE_CUSTOMER_TYPE_MISMATCH" } });
    expect(createCustomer).not.toHaveBeenCalled();

    const individual = await createChild(manager.id, "individual", "multipart-individual@example.com");
    await ManagedProfileManager.update(
      { allowedCustomerTypes: ["individual"] },
      { where: { profileId: manager.id } }
    );
    const parsedForm = new FormData();
    parsedForm.set("country", "US");
    parsedForm.set("file", new Blob(["document"]), "document.pdf");
    const deniedAfterParsing = await fetch(`${baseUrl}/submitKycFile`, {
      body: parsedForm,
      headers: { "X-API-Key": credential.plaintextKey, "X-Managed-Profile-Id": individual.profileId },
      method: "POST"
    });
    expect(deniedAfterParsing.status).toBe(403);
  });

  it("rejects a legacy managed child without contact email before provider access", async () => {
    const manager = await createManager();
    const childId = crypto.randomUUID();
    await sequelize.transaction(async transaction => {
      const child = await User.create({ email: null, id: childId, kind: "managed" }, { transaction });
      const entity = await CustomerEntity.create({ profileId: childId, status: "active", type: "individual" }, { transaction });
      await child.update({ activeCustomerEntityId: entity.id }, { transaction });
      await ManagedProfile.create(
        {
          creationSource: "manager",
          externalSubjectId: "legacy-child",
          managerProfileId: manager.id,
          profileId: childId
        },
        { transaction }
      );
    });
    const credential = await createTestApiKey({ userId: manager.id });
    const createCustomer = mock(async () => ({ customerId: "unexpected", createdAt: new Date().toISOString() }));
    provider(createCustomer);

    const response = await fetch(`${baseUrl}/createIndividualCustomer`, {
      body: JSON.stringify({ country: "MX" }),
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": credential.plaintextKey,
        "X-Managed-Profile-Id": childId
      },
      method: "POST"
    });

    expect(response.status).toBe(400);
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("does not bind a conflicting provider customer with a different country or type", async () => {
    const manager = await createManager();
    const child = await createChild(manager.id, "individual", "child@example.com");
    const credential = await createTestApiKey({ userId: manager.id });
    const createCustomer = mock(async () => {
      throw new Error("409 already registered");
    });
    const findCustomer = mock(async () => ({
      country: "US",
      createdAt: new Date().toISOString(),
      customerId: "wrong-customer",
      type: AlfredpayCustomerType.BUSINESS
    }));
    provider(createCustomer, findCustomer);

    const response = await fetch(`${baseUrl}/createIndividualCustomer`, {
      body: JSON.stringify({ country: "MX" }),
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": credential.plaintextKey,
        "X-Managed-Profile-Id": child.profileId
      },
      method: "POST"
    });

    expect(response.status).toBe(409);
    expect(findCustomer).toHaveBeenCalledWith("child@example.com", "MX");
    expect(await ProviderCustomer.count()).toBe(0);
  });

  it("does not adopt a provider customer that already belongs to another profile", async () => {
    const victimManager = await createManager();
    const victim = await createChild(victimManager.id, "individual", "victim@example.com");
    await createAlfredpayCustomer(victim.profileId, {
      alfredPayId: "victim-customer",
      country: "MX" as never,
      status: AlfredPayStatus.Success,
      type: AlfredpayCustomerType.INDIVIDUAL
    });

    // A second manager picks the victim's email as its child's unverified contact email.
    const attackerManager = await createTestUser({ email: "attacker@example.com" });
    await ManagedProfileManager.create({
      allowedCorridors: ["MX"],
      allowedCustomerTypes: null,
      isActive: true,
      profileId: attackerManager.id
    });
    const attackerChild = await createChild(attackerManager.id, "individual", "victim@example.com");
    const credential = await createTestApiKey({ userId: attackerManager.id });
    const createCustomer = mock(async () => {
      throw new Error("409 already registered");
    });
    const findCustomer = mock(async () => ({
      country: "MX",
      createdAt: new Date().toISOString(),
      customerId: "victim-customer",
      type: AlfredpayCustomerType.INDIVIDUAL
    }));
    provider(createCustomer, findCustomer);

    const response = await fetch(`${baseUrl}/createIndividualCustomer`, {
      body: JSON.stringify({ country: "MX" }),
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": credential.plaintextKey,
        "X-Managed-Profile-Id": attackerChild.profileId
      },
      method: "POST"
    });

    expect(response.status).toBe(409);
    const attackerEntities = await CustomerEntity.findAll({ where: { profileId: attackerChild.profileId } });
    expect(
      await ProviderCustomer.count({ where: { customerEntityId: attackerEntities.map(entity => entity.id) } })
    ).toBe(0);
  });

  it("still adopts a conflicting provider customer that nothing else claims", async () => {
    const manager = await createManager();
    const child = await createChild(manager.id, "individual", "retry@example.com");
    const credential = await createTestApiKey({ userId: manager.id });
    const createCustomer = mock(async () => {
      throw new Error("409 already registered");
    });
    const findCustomer = mock(async () => ({
      country: "MX",
      createdAt: new Date().toISOString(),
      customerId: "unclaimed-customer",
      type: AlfredpayCustomerType.INDIVIDUAL
    }));
    provider(createCustomer, findCustomer);

    const response = await fetch(`${baseUrl}/createIndividualCustomer`, {
      body: JSON.stringify({ country: "MX" }),
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": credential.plaintextKey,
        "X-Managed-Profile-Id": child.profileId
      },
      method: "POST"
    });

    expect(response.status).toBe(200);
    expect(await ProviderCustomer.count({ where: { providerCustomerId: "unclaimed-customer" } })).toBe(1);
  });

  it("denies a corridor presented in the query but operated from the body", async () => {
    const manager = await createManager(["MX"]);
    const child = await createChild(manager.id, "individual", "desync@example.com");
    const credential = await createTestApiKey({ userId: manager.id });
    const createCustomer = mock(async () => ({ customerId: "alfred-desync", createdAt: new Date().toISOString() }));
    provider(createCustomer);

    const response = await fetch(`${baseUrl}/createIndividualCustomer?country=MX`, {
      body: JSON.stringify({ country: "CO" }),
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": credential.plaintextKey,
        "X-Managed-Profile-Id": child.profileId
      },
      method: "POST"
    });

    expect(response.status).toBe(400);
    expect(createCustomer).not.toHaveBeenCalled();
    expect(await ProviderCustomer.count()).toBe(0);
  });

  it.each([
    ["missing customer id", { country: "MX", type: AlfredpayCustomerType.INDIVIDUAL }],
    ["empty customer id", { country: "MX", customerId: "  ", type: AlfredpayCustomerType.INDIVIDUAL }],
    ["missing country", { customerId: "customer-1", type: AlfredpayCustomerType.INDIVIDUAL }],
    ["missing type", { country: "MX", customerId: "customer-1" }]
  ])("does not bind a conflicting provider customer with %s", async (_label, providerCustomer) => {
    const manager = await createManager();
    const child = await createChild(manager.id, "individual", "invalid-conflict@example.com");
    const credential = await createTestApiKey({ userId: manager.id });
    provider(
      mock(async () => {
        throw new Error("409 already registered");
      }),
      mock(async () => providerCustomer as never)
    );

    const response = await fetch(`${baseUrl}/createIndividualCustomer`, {
      body: JSON.stringify({ country: "MX" }),
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": credential.plaintextKey,
        "X-Managed-Profile-Id": child.profileId
      },
      method: "POST"
    });

    expect(response.status).toBe(502);
    expect(await ProviderCustomer.count()).toBe(0);
  });
});
