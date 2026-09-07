import { afterAll, afterEach, beforeAll, describe, expect, it, mock, spyOn } from "bun:test";
import express from "express";
import { AlfredpayApiService } from "@vortexfi/shared";
import CustomerEntity from "../../../models/customerEntity.model";
import ManagedProfile from "../../../models/managedProfile.model";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import ManagedProfileMembership from "../../../models/managedProfileMembership.model";
import ProfileRole from "../../../models/profileRole.model";
import ProviderCustomer from "../../../models/providerCustomer.model";
import RecipientInvitation from "../../../models/recipientInvitation.model";
import SenderRecipient from "../../../models/senderRecipient.model";
import User from "../../../models/user.model";
import * as apiKeyAuthHelpers from "../../middlewares/apiKeyAuth.helpers";
import * as limitsService from "../../services/limits.service";
import * as customerEntityService from "../../services/customer-entity.service";
import * as eligibilityService from "../../services/recipients/transfer-eligibility.service";
import * as alfredpayCustomerService from "../../services/alfredpay/alfredpay-customer.service";
import * as rampInfoService from "../../services/rampInfo.service";
import { SupabaseAuthService } from "../../services/auth";
import limitsRoutes from "./limits.route";
import rampInfoRoutes from "./ramp-info.route";
import alfredpayRoutes from "./alfredpay.route";
import brlaRoutes from "./brla.route";
import brlaImportRoutes from "./brla-kyc-import.route";
import recipientsRoutes from "./recipients.route";

const MANAGER_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_ID = "22222222-2222-4222-8222-222222222222";
const SECRET_KEY = `sk_test_${"a".repeat(32)}`;
const PUBLIC_KEY = `pk_test_${"b".repeat(32)}`;

describe("managed profile read routes", () => {
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;

  beforeAll(() => {
    const app = express();
    app.use("/v1/brla/kyc/import-token", brlaImportRoutes);
    app.use(express.json());
    app.use("/v1/alfredpay", alfredpayRoutes);
    app.use("/v1/brla", brlaRoutes);
    app.use("/v1/recipients", recipientsRoutes);
    app.use("/v1/limits", limitsRoutes);
    app.use("/v1/ramp-info", rampInfoRoutes);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind test server");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(() => mock.restore());
  afterAll(() => server.close());

  function allowManagedProfile(allowedCorridors = ["BR", "MX", "US"], role = "manager"): void {
    spyOn(ManagedProfileManager, "findByPk").mockResolvedValue({ allowedCorridors, allowedCustomerTypes: null, isActive: true } as never);
    spyOn(ManagedProfile, "findOne").mockResolvedValue({ id: "relationship-1", managerProfileId: "owner-1" } as never);
    spyOn(ManagedProfileMembership, "findOne").mockResolvedValue({ id: "membership-1", role } as never);
    spyOn(User, "findByPk").mockResolvedValue({ activeCustomerEntityId: "entity-1", kind: "managed" } as never);
    spyOn(CustomerEntity, "findAll").mockResolvedValue([{ id: "entity-1", status: "active", type: "individual" }] as never);
  }

  function authenticateMember(): void {
    spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({ user_id: MANAGER_ID, valid: true });
    spyOn(apiKeyAuthHelpers, "validateSecretApiKey").mockResolvedValue({
      apiKeyId: "credential-1",
      credential: {
        credentialId: "credential-1",
        environment: "test",
        partnerId: null,
        profileId: MANAGER_ID,
        strength: "secret"
      },
      partner: null
    });
  }

  it("keeps fiat-account mutations Manage and reads Read for both bearer and secret members", async () => {
    authenticateMember();
    allowManagedProfile();
    const customerLookup = spyOn(alfredpayCustomerService, "findAlfredpayCustomer")
      .mockResolvedValue({ alfredPayId: "child-provider-id" } as never);
    const createFiatAccount = mock(async () => ({ id: "fiat-1" }));
    const deleteFiatAccount = mock(async () => {});
    const listFiatAccounts = mock(async () => []);
    spyOn(AlfredpayApiService, "getInstance").mockReturnValue({
      createFiatAccount, deleteFiatAccount, listFiatAccounts
    } as never);
    for (const role of ["manager", "read_only"]) {
      spyOn(ManagedProfileMembership, "findOne").mockResolvedValue({ id: "membership-1", role } as never);
      for (const auth of [{ Authorization: "Bearer member-token" }, { "X-API-Key": SECRET_KEY }] as Record<string, string>[]) {
        const headers = { ...auth, "Content-Type": "application/json", "X-Managed-Profile-Id": CHILD_ID };
        expect((await fetch(`${baseUrl}/v1/alfredpay/fiatAccounts?country=MX`, { headers })).status).toBe(200);
        expect((await fetch(`${baseUrl}/v1/alfredpay/fiatAccounts`, {
          headers, method: "POST", body: JSON.stringify({ country: "MX", type: "SPEI", accountNumber: "123" })
        })).status).toBe(role === "manager" ? 200 : 403);
        expect((await fetch(`${baseUrl}/v1/alfredpay/fiatAccounts/fiat-1?country=MX`, {
          headers, method: "DELETE"
        })).status).toBe(role === "manager" ? 204 : 403);
      }
    }
    expect(customerLookup).toHaveBeenCalledWith(CHILD_ID, "MX");
    expect(createFiatAccount).toHaveBeenCalledTimes(2);
    expect(deleteFiatAccount).toHaveBeenCalledTimes(2);
    expect(deleteFiatAccount).toHaveBeenCalledWith("child-provider-id", "fiat-1");
    expect(listFiatAccounts).toHaveBeenCalledTimes(4);
  });

  it("classifies every provider mutation as secret-only, including GET links and multipart uploads", async () => {
    authenticateMember();
    allowManagedProfile();
    const mutations = [
      ["GET", "/brla/getSelfieLivenessUrl"],
      ...["createSubaccount", "getUploadUrls", "newKyc", "kyb/new-level-1/web-sdk", "kyb/documents", "kyb/ubos",
        "kyb/new-level-1/api", "kyc/record-attempt", "kyc/import-token"].map(path => ["POST", `/brla/${path}`]),
      ...["getKycRedirectLink", "getKybRedirectLink"].map(path => ["GET", `/alfredpay/${path}?country=MX`]),
      ...["createIndividualCustomer", "createBusinessCustomer", "kycRedirectOpened", "kycRedirectFinished", "retryKyc",
        "submitKycInformation", "submitKycFile", "sendKycSubmission", "submitKybInformation", "submitKybFile",
        "submitKybRelatedPersonFile", "sendKybSubmission"].map(path => ["POST", `/alfredpay/${path}`])
    ];
    for (const [method, path] of mutations) {
      const response = await fetch(`${baseUrl}/v1${path}`, {
        method,
        ...(method === "POST" ? { body: JSON.stringify({ country: "MX" }) } : {}),
        headers: { Authorization: "Bearer member-token", "Content-Type": "application/json", "X-Managed-Profile-Id": CHILD_ID }
      });
      expect({ path, status: response.status, body: await response.json() }).toMatchObject({
        path, status: 403, body: { error: { code: "MANAGED_PROFILE_REQUIRES_API_CREDENTIAL" } }
      });
    }
    spyOn(ManagedProfileMembership, "findOne").mockResolvedValue({ id: "membership-1", role: "read_only" } as never);
    for (const [method, path] of mutations) {
      const response = await fetch(`${baseUrl}/v1${path}`, {
        method,
        ...(method === "POST" ? { body: JSON.stringify({ country: "MX" }) } : {}),
        headers: { "X-API-Key": SECRET_KEY, "Content-Type": "application/json", "X-Managed-Profile-Id": CHILD_ID }
      });
      expect({ path, status: response.status, body: await response.json() }).toMatchObject({
        path, status: 403, body: { error: { code: "MANAGED_PROFILE_MANAGER_REQUIRED" } }
      });
    }
  });

  it("allows member-secret recipient operations on the exact child and checks the actor's discount role", async () => {
    authenticateMember();
    allowManagedProfile();
    const resolveEntity = spyOn(customerEntityService, "getOrCreateCustomerEntityForProfile")
      .mockResolvedValue({ id: "entity-1" } as never);
    spyOn(SenderRecipient, "findAll").mockResolvedValue([]);
    spyOn(RecipientInvitation, "findAll").mockResolvedValue([]);
    spyOn(RecipientInvitation, "update").mockResolvedValue([0]);
    spyOn(ProviderCustomer, "count").mockResolvedValue(1);
    const role = spyOn(ProfileRole, "findOne").mockResolvedValue(null);
    const create = spyOn(RecipientInvitation, "create").mockImplementation(async values => values as never);
    const update = mock(async () => {});
    const recipientId = "33333333-3333-4333-8333-333333333333";
    const recipient = { id: recipientId, rail: "brl", get: () => ({ country: "BR" }), update };
    const findRecipient = spyOn(SenderRecipient, "findOne").mockResolvedValue(recipient as never);
    const findInvitation = spyOn(RecipientInvitation, "findOne").mockResolvedValue({ id: recipientId, country: "BR", update } as never);
    spyOn(eligibilityService, "getTransferEligibility").mockResolvedValue({ canCreateTransfer: true } as never);
    const headers = { "X-API-Key": SECRET_KEY, "Content-Type": "application/json", "X-Managed-Profile-Id": CHILD_ID };
    const invite = { country: "BR", rail: "brl", payoutCurrency: "brl" };

    expect((await fetch(`${baseUrl}/v1/recipients`, { headers })).status).toBe(200);
    expect((await fetch(`${baseUrl}/v1/recipients/${recipientId}/eligibility`, { headers })).status).toBe(200);
    expect((await fetch(`${baseUrl}/v1/recipients/${recipientId}`, {
      headers, method: "PATCH", body: JSON.stringify({ nickname: "Child recipient" })
    })).status).toBe(200);
    expect((await fetch(`${baseUrl}/v1/recipients/invitations/${recipientId}`, {
      headers, method: "PATCH", body: JSON.stringify({ archived: true })
    })).status).toBe(200);
    expect((await fetch(`${baseUrl}/v1/recipients/invite`, {
      headers, method: "POST", body: JSON.stringify(invite)
    })).status).toBe(201);
    expect(resolveEntity).toHaveBeenCalledWith(CHILD_ID);
    expect(findRecipient).toHaveBeenCalledWith(expect.objectContaining({ where: { id: recipientId, senderCustomerEntityId: "entity-1" } }));
    expect(findInvitation).toHaveBeenCalledWith({ where: { id: recipientId, senderCustomerEntityId: "entity-1" } });
    const deniedDiscount = await fetch(`${baseUrl}/v1/recipients/invite`, {
      headers, method: "POST", body: JSON.stringify({ ...invite, discounts: { buyBps: 1 } })
    });
    expect(await deniedDiscount.json()).toMatchObject({ error: { code: "DISCOUNT_ROLE_REQUIRED" } });
    expect(role).toHaveBeenCalledWith({ where: { role: "discount_manager", userId: MANAGER_ID } });
    expect(create).toHaveBeenCalledTimes(1);
    role.mockResolvedValue({ role: "discount_manager" } as never);
    expect((await fetch(`${baseUrl}/v1/recipients/invite`, {
      headers, method: "POST", body: JSON.stringify({ ...invite, discounts: { buyBps: 1 } })
    })).status).toBe(201);

    spyOn(ManagedProfileMembership, "findOne").mockResolvedValue({ id: "membership-1", role: "read_only" } as never);
    for (const authHeaders of [{ "X-API-Key": SECRET_KEY }, { Authorization: "Bearer member-token" }] as Record<string, string>[]) {
      const readOnlyHeaders = { "Content-Type": "application/json", "X-Managed-Profile-Id": CHILD_ID, ...authHeaders };
      expect((await fetch(`${baseUrl}/v1/recipients`, { headers: readOnlyHeaders })).status).toBe(200);
      expect((await fetch(`${baseUrl}/v1/recipients/${recipientId}/eligibility`, { headers: readOnlyHeaders })).status).toBe(200);
      for (const [method, path, body] of [
        ["POST", "invite", invite], ["PATCH", recipientId, { nickname: "denied" }],
        ["PATCH", `invitations/${recipientId}`, { archived: true }]
      ] as const) {
        const denied = await fetch(`${baseUrl}/v1/recipients/${path}`, {
          headers: readOnlyHeaders, method, body: JSON.stringify(body)
        });
        expect(denied.status).toBe(403);
        expect(await denied.json()).toMatchObject({ error: { code: "MANAGED_PROFILE_MANAGER_REQUIRED" } });
      }
    }
    expect(update).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not open direct-child or self recipient routes to secrets and keeps invitee routes bearer-only", async () => {
    authenticateMember();
    allowManagedProfile();
    const invitationLookup = spyOn(RecipientInvitation, "findOne").mockResolvedValue(null);
    for (const [method, path] of [["GET", ""], ["POST", "/invite"], ["PATCH", `/${CHILD_ID}`],
      ["PATCH", `/invitations/${CHILD_ID}`], ["GET", `/${CHILD_ID}/eligibility`],
      ["GET", "/invite/token"], ["POST", "/invite/token/accept"]]) {
      expect((await fetch(`${baseUrl}/v1/recipients${path}`, { method, headers: { "X-API-Key": SECRET_KEY } })).status).toBe(401);
    }
    spyOn(apiKeyAuthHelpers, "validateSecretApiKey").mockResolvedValue({
      apiKeyId: "child-key", partner: null,
      credential: { credentialId: "child-key", environment: "test", partnerId: null, profileId: CHILD_ID, strength: "secret",
        managedProfile: { allowedCorridors: ["BR"], allowedCustomerTypes: null, controllingManagerProfileId: MANAGER_ID, relationshipId: "relationship-1" } }
    });
    for (const [method, path] of [["GET", ""], ["POST", "/invite"], ["PATCH", `/${CHILD_ID}`],
      ["PATCH", `/invitations/${CHILD_ID}`], ["GET", `/${CHILD_ID}/eligibility`]]) {
      expect((await fetch(`${baseUrl}/v1/recipients${path}`, {
        method, headers: { "X-API-Key": SECRET_KEY, "X-Managed-Profile-Id": CHILD_ID }
      })).status).toBe(403);
    }
    for (const [method, path] of [["GET", "/invite/token"], ["POST", "/invite/token/accept"]]) {
      expect((await fetch(`${baseUrl}/v1/recipients${path}`, {
        method, headers: { Authorization: "Bearer member-token", "X-Managed-Profile-Id": CHILD_ID }
      })).status).toBe(400);
      expect((await fetch(`${baseUrl}/v1/recipients${path}`, {
        method, headers: { Authorization: "Bearer member-token" }
      })).status).toBe(404);
    }
    expect(invitationLookup).toHaveBeenCalledTimes(2);
  });

  it("returns exact child limits through a manager Bearer session", async () => {
    spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({ user_id: MANAGER_ID, valid: true });
    allowManagedProfile();
    const getUserLimits = spyOn(limitsService, "getUserLimits").mockResolvedValue({ limits: [] });

    const response = await fetch(`${baseUrl}/v1/limits`, {
      body: JSON.stringify({ corridors: ["BR", "MX"] }),
      headers: {
        Authorization: "Bearer manager-token",
        "Content-Type": "application/json",
        "X-Managed-Profile-Id": CHILD_ID
      },
      method: "POST"
    });

    expect(response.status).toBe(200);
    expect(getUserLimits).toHaveBeenCalledWith(CHILD_ID, ["BR", "MX"]);
  });

  it("accepts a manager secret for child limits and rejects a disallowed requested corridor", async () => {
    spyOn(apiKeyAuthHelpers, "validateSecretApiKey").mockResolvedValue({
      apiKeyId: "credential-1",
      credential: {
        credentialId: "credential-1",
        environment: "test",
        partnerId: null,
        profileId: MANAGER_ID,
        strength: "secret"
      },
      partner: null
    });
    allowManagedProfile(["BR"]);
    const getUserLimits = spyOn(limitsService, "getUserLimits").mockResolvedValue({ limits: [] });

    const allowedResponse = await fetch(`${baseUrl}/v1/limits`, {
      body: JSON.stringify({ corridors: ["BR"] }),
      headers: { "Content-Type": "application/json", "X-API-Key": SECRET_KEY, "X-Managed-Profile-Id": CHILD_ID },
      method: "POST"
    });
    const deniedResponse = await fetch(`${baseUrl}/v1/limits`, {
      body: JSON.stringify({ corridors: ["BR", "MX"] }),
      headers: { "Content-Type": "application/json", "X-API-Key": SECRET_KEY, "X-Managed-Profile-Id": CHILD_ID },
      method: "POST"
    });

    expect(allowedResponse.status).toBe(200);
    expect(deniedResponse.status).toBe(403);
    expect(getUserLimits).toHaveBeenCalledTimes(1);
    expect(getUserLimits).toHaveBeenCalledWith(CHILD_ID, ["BR"]);
  });

  it("validates managed child limit input before corridor authorization", async () => {
    spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({ user_id: MANAGER_ID, valid: true });
    const getUserLimits = spyOn(limitsService, "getUserLimits").mockResolvedValue({ limits: [] });

    const response = await fetch(`${baseUrl}/v1/limits`, {
      body: JSON.stringify({ corridors: ["BR", "BR"] }),
      headers: {
        Authorization: "Bearer manager-token",
        "Content-Type": "application/json",
        "X-Managed-Profile-Id": CHILD_ID
      },
      method: "POST"
    });

    expect(response.status).toBe(400);
    expect(getUserLimits).not.toHaveBeenCalled();
  });

  it("rejects public-key-only ramp-info delegation", async () => {
    spyOn(apiKeyAuthHelpers, "validatePublicApiKey").mockResolvedValue({
      credential: {
        credentialId: "credential-1",
        environment: "test",
        partnerId: null,
        profileId: MANAGER_ID,
        strength: "public"
      }
    });

    const response = await fetch(`${baseUrl}/v1/ramp-info`, {
      headers: { "X-Managed-Profile-Id": CHILD_ID, "X-Public-Key": PUBLIC_KEY }
    });

    expect(response.status).toBe(401);
  });

  it("preserves public and secret self ramp-info reads", async () => {
    const credential = {
      credentialId: "credential-1",
      environment: "test" as const,
      partnerId: null,
      profileId: MANAGER_ID
    };
    spyOn(apiKeyAuthHelpers, "validatePublicApiKey").mockResolvedValue({
      credential: { ...credential, strength: "public" }
    });
    spyOn(apiKeyAuthHelpers, "validateApiKey").mockResolvedValue({
      apiKeyId: "credential-1",
      credential: { ...credential, strength: "secret" },
      partner: null
    });
    const getRampInfo = spyOn(rampInfoService, "getRampInfo").mockResolvedValue({ corridors: {} } as never);

    const publicResponse = await fetch(`${baseUrl}/v1/ramp-info`, { headers: { "X-Public-Key": PUBLIC_KEY } });
    const secretResponse = await fetch(`${baseUrl}/v1/ramp-info`, { headers: { "X-API-Key": SECRET_KEY } });

    expect(publicResponse.status).toBe(200);
    expect(secretResponse.status).toBe(200);
    expect(getRampInfo).toHaveBeenCalledTimes(2);
    expect(getRampInfo).toHaveBeenNthCalledWith(1, MANAGER_ID);
    expect(getRampInfo).toHaveBeenNthCalledWith(2, MANAGER_ID);
  });

  it("returns aggregate child ramp-info through a manager secret", async () => {
    spyOn(apiKeyAuthHelpers, "validateApiKey").mockResolvedValue({
      apiKeyId: "credential-1",
      credential: {
        credentialId: "credential-1",
        environment: "test",
        partnerId: null,
        profileId: MANAGER_ID,
        strength: "secret"
      },
      partner: null
    });
    allowManagedProfile();
    const getRampInfo = spyOn(rampInfoService, "getRampInfo").mockResolvedValue({ corridors: {} } as never);

    const response = await fetch(`${baseUrl}/v1/ramp-info`, {
      headers: { "X-API-Key": SECRET_KEY, "X-Managed-Profile-Id": CHILD_ID }
    });

    expect(response.status).toBe(200);
    expect(getRampInfo).toHaveBeenCalledWith(CHILD_ID);
  });
});
