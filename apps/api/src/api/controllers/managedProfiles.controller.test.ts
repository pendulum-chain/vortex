import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import express from "express";
import { config } from "../../config/vars";
import ApiCredential from "../../models/apiCredential.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import ManagedProfileMembership from "../../models/managedProfileMembership.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestApiKey, createTestUser } from "../../test-utils/factories";
import managedProfilesRoutes from "../routes/v1/managed-profiles.route";
import { SupabaseAuthService } from "../services/auth";
import * as bearerPrincipal from "../middlewares/bearerPrincipal";
import * as credentialService from "../services/apiCredential.service";
import { getManagedProfile, listManagedProfiles } from "../services/managed-profile-lifecycle.service";
import {
  changeManagedProfileMember,
  createManagedProfileInvitation,
  readOrAcceptManagedProfileInvitation,
  removeManagedProfileMember
} from "../services/managed-profile-membership.service";

const BASE_PATH = "/v1/managed-profiles";

describe("managed profile lifecycle routes", () => {
  const originalDashboardPublicUrl = config.dashboardPublicUrl;
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    await setupTestDatabase();
    const app = express();
    app.use(express.json());
    app.use(BASE_PATH, managedProfilesRoutes);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind test server");
    baseUrl = `http://127.0.0.1:${address.port}${BASE_PATH}`;
  });

  afterAll(() => server?.close());
  afterEach(() => {
    mock.restore();
    config.dashboardPublicUrl = originalDashboardPublicUrl;
  });
  beforeEach(resetTestDatabase);

  async function createManager(isActive = true) {
    const manager = await createTestUser();
    await ManagedProfileManager.create({ allowedCorridors: ["BR"], isActive, profileId: manager.id });
    const credential = await createTestApiKey({ userId: manager.id });
    return { headers: { "Content-Type": "application/json", "X-API-Key": credential.plaintextKey }, manager };
  }

  async function invitedManager() {
    config.dashboardPublicUrl = "https://dashboard.example.com";
    const owner = await createManager();
    const childResponse = await fetch(baseUrl, {
      body: JSON.stringify({ contactEmail: "credential-race@example.com", customerType: "individual", externalSubjectId: "credential-race" }),
      headers: owner.headers,
      method: "POST"
    });
    expect(childResponse.status).toBe(201);
    const profileId = ((await childResponse.json()) as { managedProfile: { profileId: string } }).managedProfile.profileId;
    const member = await createTestUser();
    const { invitation } = await createManagedProfileInvitation(owner.manager.id, profileId, { email: member.email, role: "manager" });
    await readOrAcceptManagedProfileInvitation({ profileId: member.id, email: member.email, emailConfirmedAt: new Date().toISOString() }, invitation.id, true);
    const secret = await createTestApiKey({ userId: member.id });
    spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({ user_id: member.id, valid: true });
    return { member, owner, profileId, secret, url: `${baseUrl}/${profileId}/api-credentials` };
  }

  for (const auth of ["bearer", "secret"] as const) {
    it(`returns 200 and false actor flags for a ${auth} actor with no memberships`, async () => {
      const actor = await createTestUser();
      const credential = await createTestApiKey({ userId: actor.id });
      spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({ user_id: actor.id, valid: true });
      const headers: Record<string, string> = auth === "bearer"
        ? { Authorization: "Bearer actor-token" }
        : { "X-API-Key": credential.plaintextKey };
      const response = await fetch(`${baseUrl}?limit=1&offset=100`, { headers });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        actor: { canProvisionManagedProfiles: false, hasMemberships: false, profileId: actor.id },
        managedProfiles: [], pagination: { limit: 1, offset: 100, total: 0 }
      });
      for (const status of ["all", "deleted"]) {
        const denied = await fetch(`${baseUrl}?status=${status}`, { headers });
        expect(denied.status).toBe(403);
        expect(await denied.json()).toMatchObject({ error: { code: "MANAGED_PROFILE_OWNER_REQUIRED" } });
      }
    });

    for (const role of ["manager", "read_only"] as const) {
      it(`restricts retained profiles and invalidates historical bootstrap for a ${role} ${auth} actor`, async () => {
        const { member, owner, profileId, secret } = await invitedManager();
        if (role === "read_only") await changeManagedProfileMember(owner.manager.id, profileId, member.id, role);
        spyOn(SupabaseAuthService, "verifyToken").mockImplementation(async token => ({ user_id: token, valid: true }));
        const headers: Record<string, string> = auth === "bearer"
          ? { Authorization: `Bearer ${member.id}` }
          : { "X-API-Key": secret.plaintextKey };
        const ownerHeaders: Record<string, string> = auth === "bearer"
          ? { Authorization: `Bearer ${owner.manager.id}` }
          : owner.headers;
        const childUrl = `${baseUrl}/${profileId}`;
        const selected = { ...headers, "X-Managed-Profile-Id": profileId };
        const selectedOwner = { ...ownerHeaders, "X-Managed-Profile-Id": profileId };
        const page = await fetch(`${baseUrl}?limit=1&offset=100`, { headers });
        expect(await page.json()).toMatchObject({
          actor: { canProvisionManagedProfiles: false, hasMemberships: true, profileId: member.id },
          managedProfiles: [], pagination: { total: 1 }
        });
        const detail = await fetch(childUrl, { headers: selected });
        expect(detail.status).toBe(200);
        expect(await detail.json()).toMatchObject({
          actor: { canProvisionManagedProfiles: false, hasMemberships: true, profileId: member.id },
          managedProfile: { profileId, membership: { isOwner: false, role } }
        });
        const deniedDeletion = await fetch(childUrl, { headers: selected, method: "DELETE" });
        expect(deniedDeletion.status).toBe(403);
        expect(await deniedDeletion.json()).toMatchObject({ error: { code: "MANAGED_PROFILE_OWNER_REQUIRED" } });

        await ManagedProfileManager.update({ isActive: false }, { where: { profileId: owner.manager.id } });
        for (const bootstrapHeaders of [selected, selectedOwner]) {
          const denied = await fetch(childUrl, { headers: bootstrapHeaders });
          expect(denied.status).toBe(403);
          expect(await denied.json()).toMatchObject({ error: { code: "MANAGED_PROFILE_MEMBERSHIP_INVALID" } });
        }
        expect(await (await fetch(baseUrl, { headers })).json()).toMatchObject({
          actor: { canProvisionManagedProfiles: false, hasMemberships: false }, managedProfiles: []
        });
        await ManagedProfileManager.update({ isActive: true }, { where: { profileId: owner.manager.id } });
        expect((await fetch(childUrl, { headers: ownerHeaders, method: "DELETE" })).status).toBe(204);

        expect((await fetch(childUrl, { headers })).status).toBe(404);
        await expect(getManagedProfile(member.id, profileId)).rejects.toMatchObject({ code: "MANAGED_PROFILE_NOT_FOUND" });
        for (const bootstrapHeaders of [selected, selectedOwner]) {
          const denied = await fetch(childUrl, { headers: bootstrapHeaders });
          expect(denied.status).toBe(403);
          expect(await denied.json()).toMatchObject({ error: { code: "MANAGED_PROFILE_MEMBERSHIP_INVALID" } });
        }
        const retained = await fetch(childUrl, { headers: ownerHeaders });
        expect(retained.status).toBe(200);
        expect(await retained.json()).toMatchObject({
          actor: { canProvisionManagedProfiles: true, hasMemberships: false },
          managedProfile: { profileId, status: "deleted" }
        });
        for (const status of ["all", "deleted"] as const) {
          const denied = await fetch(`${baseUrl}?status=${status}`, { headers });
          expect(denied.status).toBe(403);
          expect(await denied.json()).toMatchObject({ error: { code: "MANAGED_PROFILE_OWNER_REQUIRED" } });
          await expect(listManagedProfiles(member.id, { status, offset: 0, limit: 50 })).rejects.toMatchObject({
            code: "MANAGED_PROFILE_OWNER_REQUIRED"
          });
          const owned = await fetch(`${baseUrl}?status=${status}`, { headers: ownerHeaders });
          expect(owned.status).toBe(200);
          expect(await owned.json()).toMatchObject({
            actor: { canProvisionManagedProfiles: true, hasMemberships: false },
            managedProfiles: [{ profileId, status: "deleted" }], pagination: { total: 1 }
          });
        }
        await ManagedProfileManager.update({ isActive: false }, { where: { profileId: owner.manager.id } });
        expect((await fetch(childUrl, { headers: ownerHeaders })).status).toBe(404);
        for (const status of ["all", "deleted"]) {
          const denied = await fetch(`${baseUrl}?status=${status}`, { headers: ownerHeaders });
          expect(denied.status).toBe(403);
          expect(await denied.json()).toMatchObject({ error: { code: "MANAGED_PROFILE_OWNER_REQUIRED" } });
        }
      });
    }

    it(`uses membership history, not the ${auth} selector, to distinguish invalid bootstrap from unknown-child probing`, async () => {
      const { member, owner, profileId, secret } = await invitedManager();
      await removeManagedProfileMember(owner.manager.id, profileId, member.id);
      const stranger = await createTestUser();
      const strangerCredential = await createTestApiKey({ userId: stranger.id });
      spyOn(SupabaseAuthService, "verifyToken").mockImplementation(async token => ({ user_id: token, valid: true }));
      const headers: Record<string, string> = auth === "bearer"
        ? { Authorization: `Bearer ${member.id}` }
        : { "X-API-Key": secret.plaintextKey };
      const strangerHeaders: Record<string, string> = auth === "bearer"
        ? { Authorization: `Bearer ${stranger.id}` }
        : { "X-API-Key": strangerCredential.plaintextKey };
      const historical = await fetch(`${baseUrl}/${profileId}`, { headers: { ...headers, "X-Managed-Profile-Id": profileId } });
      expect(historical.status).toBe(403);
      expect(await historical.json()).toMatchObject({ error: { code: "MANAGED_PROFILE_MEMBERSHIP_INVALID" } });
      expect((await fetch(`${baseUrl}/${profileId}`, { headers })).status).toBe(404);
      for (const subject of [profileId, crypto.randomUUID()]) {
        for (const selected of [false, true]) {
          const probeHeaders = { ...strangerHeaders, ...(selected ? { "X-Managed-Profile-Id": subject } : {}) };
          for (const method of ["GET", "DELETE"]) {
            const response = await fetch(`${baseUrl}/${subject}`, { headers: probeHeaders, method });
            expect(response.status).toBe(404);
            expect(await response.json()).toEqual({
              error: { code: "MANAGED_PROFILE_NOT_FOUND", message: "Managed profile was not found", status: 404 }
            });
          }
        }
      }
    });
  }

  for (const method of ["POST", "DELETE"] as const) {
    for (const change of ["remove", "downgrade"] as const) {
      for (const auth of ["bearer", "secret"] as const) {
        it(`denies credential ${method} when membership is ${change}d after ${auth} middleware authorization`, async () => {
          const { member, owner, profileId, secret, url } = await invitedManager();
          const initial = await fetch(url, { headers: owner.headers, method: "POST", body: JSON.stringify({ name: "Existing company key" }) });
          expect(initial.status).toBe(201);
          const existing = (await initial.json()) as { id: string };
          const beforeService = async () => {
            if (change === "remove") await removeManagedProfileMember(owner.manager.id, profileId, member.id);
            else await changeManagedProfileMember(owner.manager.id, profileId, member.id, "read_only");
          };
          // This boundary is reached only after the real route middleware has authorized the member.
          const create = credentialService.createManagedProfileCredential;
          const revoke = credentialService.revokeManagedProfileCredential;
          const intercepted = method === "POST"
            ? spyOn(credentialService, "createManagedProfileCredential").mockImplementationOnce(async input => {
                await beforeService();
                return create(input);
              })
            : spyOn(credentialService, "revokeManagedProfileCredential").mockImplementationOnce(async (...args) => {
                await beforeService();
                return revoke(...args);
              });
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-Managed-Profile-Id": profileId,
            ...(auth === "bearer" ? { Authorization: "Bearer member-token" } : { "X-API-Key": secret.plaintextKey })
          };
          const response = await fetch(method === "POST" ? url : `${url}/${existing.id}`, {
            headers,
            method,
            ...(method === "POST" ? { body: JSON.stringify({ name: "Denied key", actorProfileId: owner.manager.id, membershipRole: "manager" }) } : {})
          });
          expect(intercepted).toHaveBeenCalledTimes(1);
          expect(response.status).toBe(403);
          expect(await response.json()).toMatchObject({ error: { code: "CREDENTIAL_ACCESS_DENIED" } });
          expect(await ApiCredential.count({ where: { profileId } })).toBe(1);
          expect((await ApiCredential.findByPk(existing.id))?.revokedAt).toBeNull();
        });
      }
    }
  }

  it("lets an invited manager mint/revoke company keys while human removal leaves remaining company keys valid", async () => {
    const { member, owner, profileId, secret, url } = await invitedManager();
    expect(await ManagedProfileManager.findByPk(member.id)).toBeNull();
    const keys: Array<{ id: string; publicKey: string; secretKey: string }> = [];
    for (const auth of [{ Authorization: "Bearer member-token" }, { "X-API-Key": secret.plaintextKey }] as Record<string, string>[]) {
      const headers = { ...auth, "Content-Type": "application/json", "X-Managed-Profile-Id": profileId };
      const response = await fetch(url, { headers, method: "POST", body: JSON.stringify({ name: "Company integration" }) });
      expect(response.status).toBe(201);
      keys.push(await response.json() as { id: string; publicKey: string; secretKey: string });
    }
    const revokeResponse = await fetch(`${url}/${keys[0].id}`, { headers: { Authorization: "Bearer member-token" }, method: "DELETE" });
    expect(revokeResponse.status).toBe(204);
    await removeManagedProfileMember(owner.manager.id, profileId, member.id);
    expect((await ApiCredential.findByPk(keys[1].id))?.revokedAt).toBeNull();
    expect(await credentialService.validatePublicKey(keys[1].publicKey)).toMatchObject({ profileId, strength: "public" });
    expect(await credentialService.validateSecretKey(keys[1].secretKey)).toMatchObject({ profileId, strength: "secret" });
    expect(await credentialService.validateSecretKey(keys[0].secretKey)).toBeNull();
    expect((await fetch(`${url}/${keys[1].id}`, { headers: { "X-API-Key": secret.plaintextKey }, method: "DELETE" })).status).toBe(404);
  });

  it("requires authentication but returns the empty actor projection without active enablement", async () => {
    expect((await fetch(baseUrl)).status).toBe(401);
    const inactive = await createManager(false);
    const response = await fetch(baseUrl, { headers: inactive.headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      actor: { canProvisionManagedProfiles: false, hasMemberships: false, profileId: inactive.manager.id },
      managedProfiles: [], pagination: { limit: 50, offset: 0, total: 0 }
    });
  });

  it("creates idempotently, lists active children, reads, and logically deletes", async () => {
    const { headers, manager } = await createManager();
    const body = JSON.stringify({
      contactEmail: " Managed.Child@Example.COM ",
      customerType: "individual",
      externalSubjectId: "customer-1"
    });
    const created = await fetch(baseUrl, { body, headers, method: "POST" });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { managedProfile: { profileId: string } };
    const profileId = createdBody.managedProfile.profileId;
    expect(createdBody).toMatchObject({
      managedProfile: {
        contactEmail: "managed.child@example.com",
        creationSource: "manager",
        customerType: "individual",
        status: "active"
      }
    });

    expect((await fetch(baseUrl, { body, headers, method: "POST" })).status).toBe(200);
    const listed = await fetch(baseUrl, { headers });
    expect(await listed.json()).toMatchObject({
      actor: { canProvisionManagedProfiles: true, hasMemberships: true, profileId: manager.id },
      managedProfiles: [
        {
          membership: { isOwner: true, role: "manager" },
          policy: { allowedCorridors: ["BR"], allowedCustomerTypes: null },
          profileId,
          status: "active"
        }
      ],
      pagination: { limit: 50, offset: 0, total: 1 }
    });
    expect((await fetch(`${baseUrl}/${profileId}`, { headers })).status).toBe(200);

    const childCredential = await createTestApiKey({ userId: profileId });
    expect((await fetch(`${baseUrl}/${profileId}`, { headers, method: "DELETE" })).status).toBe(204);
    expect((await fetch(`${baseUrl}/${profileId}`, { headers, method: "DELETE" })).status).toBe(204);
    expect((await ApiCredential.findByPk(childCredential.record.id))?.revokedAt).toBeInstanceOf(Date);

    const activeOnly = await fetch(baseUrl, { headers });
    expect(await activeOnly.json()).toMatchObject({ managedProfiles: [], pagination: { total: 0 } });
    const all = await fetch(`${baseUrl}?status=all`, { headers });
    expect(await all.json()).toMatchObject({ managedProfiles: [{ profileId, status: "deleted" }] });
    expect((await fetch(`${baseUrl}/${profileId}`, { headers })).status).toBe(200);
    expect((await fetch(baseUrl, { body, headers, method: "POST" })).status).toBe(409);
  });

  it("returns manager capabilities when the active manager has no children", async () => {
    const { headers, manager } = await createManager();

    const response = await fetch(baseUrl, { headers });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      actor: { canProvisionManagedProfiles: true, hasMemberships: false, profileId: manager.id },
      managedProfiles: [],
      pagination: { limit: 50, offset: 0, total: 0 }
    });
  });

  it("returns not found for another manager's child", async () => {
    const first = await createManager();
    const second = await createManager();
    const created = await fetch(baseUrl, {
      body: JSON.stringify({
        contactEmail: "private@example.com",
        customerType: "business",
        externalSubjectId: "customer-private"
      }),
      headers: first.headers,
      method: "POST"
    });
    const profileId = ((await created.json()) as { managedProfile: { profileId: string } }).managedProfile.profileId;

    expect((await fetch(`${baseUrl}/${profileId}`, { headers: second.headers })).status).toBe(404);
    expect((await fetch(`${baseUrl}/${profileId}`, { headers: second.headers, method: "DELETE" })).status).toBe(404);
  });

  it("creates, lists, and idempotently revokes child-owned credentials", async () => {
    const first = await createManager();
    const second = await createManager();
    const createdChild = await fetch(baseUrl, {
      body: JSON.stringify({
        contactEmail: "credential-child@example.com",
        customerType: "individual",
        externalSubjectId: "credential-child"
      }),
      headers: first.headers,
      method: "POST"
    });
    const profileId = ((await createdChild.json()) as { managedProfile: { profileId: string } }).managedProfile.profileId;
    const credentialResponse = await fetch(`${baseUrl}/${profileId}/api-credentials`, {
      body: JSON.stringify({ name: "Child integration" }),
      headers: first.headers,
      method: "POST"
    });
    expect(credentialResponse.status).toBe(201);
    const credential = (await credentialResponse.json()) as {
      id: string;
      partnerId: string | null;
      profileId: string;
      secretKey: string;
    };
    expect(credential).toMatchObject({ partnerId: null, profileId, secretKey: expect.stringMatching(/^sk_/) });

    const listed = await fetch(`${baseUrl}/${profileId}/api-credentials`, { headers: first.headers });
    const listedBody = (await listed.json()) as { credentials: Array<Record<string, unknown>> };
    expect(listedBody.credentials).toHaveLength(1);
    expect(listedBody.credentials[0]).toMatchObject({ id: credential.id, partnerId: null, profileId });
    expect(listedBody.credentials[0]).not.toHaveProperty("secretKey");

    expect((await fetch(`${baseUrl}/${profileId}/api-credentials`, { headers: second.headers })).status).toBe(404);
    const revokeUrl = `${baseUrl}/${profileId}/api-credentials/${credential.id}`;
    expect((await fetch(revokeUrl, { headers: first.headers, method: "DELETE" })).status).toBe(204);
    expect((await fetch(revokeUrl, { headers: first.headers, method: "DELETE" })).status).toBe(204);
  });

  it("allows manager members to manage credentials, keeps read-only members read-only, and reserves deletion for the owner", async () => {
    const owner = await createManager();
    const createdChild = await fetch(baseUrl, {
      body: JSON.stringify({
        contactEmail: "member-capabilities@example.com",
        customerType: "individual",
        externalSubjectId: "member-capabilities"
      }),
      headers: owner.headers,
      method: "POST"
    });
    const profileId = ((await createdChild.json()) as { managedProfile: { profileId: string } }).managedProfile.profileId;
    const member = await createTestUser();
    const memberCredential = await createTestApiKey({ userId: member.id });
    const managerMember = {
      manager: member,
      headers: { "Content-Type": "application/json", "X-API-Key": memberCredential.plaintextKey }
    };
    const readOnlyMember = await createTestUser();
    const readOnlyCredential = await createTestApiKey({ userId: readOnlyMember.id });
    await ManagedProfileMembership.bulkCreate([
      {
        createdByProfileId: owner.manager.id,
        managedProfileId: profileId,
        memberProfileId: managerMember.manager.id,
        role: "manager"
      },
      {
        createdByProfileId: owner.manager.id,
        managedProfileId: profileId,
        memberProfileId: readOnlyMember.id,
        role: "read_only"
      }
    ]);
    const managerHeaders = { ...managerMember.headers, "X-Managed-Profile-Id": profileId };
    const readOnlyHeaders = {
      "Content-Type": "application/json",
      "X-API-Key": readOnlyCredential.plaintextKey,
      "X-Managed-Profile-Id": profileId
    };

    expect(
      (
        await fetch(`${baseUrl}/${profileId}/api-credentials`, {
          body: JSON.stringify({ name: "Member-created child credential" }),
          headers: managerHeaders,
          method: "POST"
        })
      ).status
    ).toBe(201);
    expect((await fetch(`${baseUrl}/${profileId}/api-credentials`, { headers: managerHeaders })).status).toBe(200);
    expect((await fetch(`${baseUrl}/${profileId}`, { headers: readOnlyHeaders })).status).toBe(200);
    expect((await fetch(`${baseUrl}/${profileId}/api-credentials`, { headers: readOnlyHeaders })).status).toBe(200);
    const deniedCredentialCreation = await fetch(`${baseUrl}/${profileId}/api-credentials`, {
      body: JSON.stringify({ name: "Denied" }),
      headers: readOnlyHeaders,
      method: "POST"
    });
    expect(deniedCredentialCreation.status).toBe(403);
    expect(await deniedCredentialCreation.json()).toMatchObject({
      error: { code: "MANAGED_PROFILE_MANAGER_REQUIRED" }
    });
    expect((await fetch(`${baseUrl}/${profileId}`, { headers: managerHeaders, method: "DELETE" })).status).toBe(403);

    spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({ user_id: member.id, valid: true });
    const bearerHeaders = {
      Authorization: "Bearer member-token", "Content-Type": "application/json", "X-Managed-Profile-Id": profileId
    };
    const bearerCreated = await fetch(`${baseUrl}/${profileId}/api-credentials`, {
      headers: bearerHeaders, method: "POST", body: JSON.stringify({ name: "Bearer-created child credential" })
    });
    expect(bearerCreated.status).toBe(201);
    const credentialId = ((await bearerCreated.json()) as { id: string }).id;
    const revokeUrl = `${baseUrl}/${profileId}/api-credentials/${credentialId}`;
    expect((await fetch(revokeUrl, { headers: readOnlyHeaders, method: "DELETE" })).status).toBe(403);
    expect((await fetch(revokeUrl, { headers: bearerHeaders, method: "DELETE" })).status).toBe(204);

    const membership = await ManagedProfileMembership.findOne({ where: { managedProfileId: profileId, memberProfileId: member.id } });
    await membership!.update({ role: "read_only" });
    expect((await fetch(`${baseUrl}/${profileId}/api-credentials`, { headers: bearerHeaders })).status).toBe(200);
    expect((await fetch(`${baseUrl}/${profileId}/api-credentials`, {
      headers: bearerHeaders, method: "POST", body: JSON.stringify({ name: "Denied bearer" })
    })).status).toBe(403);
    expect((await fetch(revokeUrl, { headers: bearerHeaders, method: "DELETE" })).status).toBe(403);
    await membership!.update({ role: "manager" });
    spyOn(bearerPrincipal, "resolveBearerPrincipal").mockResolvedValue({
      userId: member.id, valid: true, impersonation: { targetProfileId: member.id } as never
    });
    for (const [method, url] of [["POST", `${baseUrl}/${profileId}/api-credentials`], ["DELETE", revokeUrl]]) {
      const denied = await fetch(url, { headers: bearerHeaders, method });
      expect(denied.status).toBe(403);
      expect(await denied.json()).toMatchObject({ error: { code: "IMPERSONATION_NOT_ALLOWED" } });
    }
  });

  it("denies child credential lifecycle for inactive managers and deleted children", async () => {
    const owner = await createManager();
    const createdChild = await fetch(baseUrl, {
      body: JSON.stringify({
        contactEmail: "disabled-child@example.com",
        customerType: "business",
        externalSubjectId: "disabled-child"
      }),
      headers: owner.headers,
      method: "POST"
    });
    const profileId = ((await createdChild.json()) as { managedProfile: { profileId: string } }).managedProfile.profileId;

    await ManagedProfileManager.update({ isActive: false }, { where: { profileId: owner.manager.id } });
    expect((await fetch(`${baseUrl}/${profileId}/api-credentials`, { headers: owner.headers })).status).toBe(403);
    await ManagedProfileManager.update({ isActive: true }, { where: { profileId: owner.manager.id } });
    expect((await fetch(`${baseUrl}/${profileId}`, { headers: owner.headers, method: "DELETE" })).status).toBe(204);
    expect((await fetch(`${baseUrl}/${profileId}/api-credentials`, { headers: owner.headers })).status).toBe(404);
  });

  it("validates creation and list inputs", async () => {
    const { headers } = await createManager();
    expect(
      (
        await fetch(baseUrl, {
          body: JSON.stringify({ contactEmail: "customer@example.com", customerType: "technical", externalSubjectId: "customer" }),
          headers,
          method: "POST"
        })
      ).status
    ).toBe(400);
    expect(
      (
        await fetch(baseUrl, {
          body: JSON.stringify({ customerType: "individual", externalSubjectId: "customer" }),
          headers,
          method: "POST"
        })
      ).status
    ).toBe(400);
    expect((await fetch(`${baseUrl}?limit=101`, { headers })).status).toBe(400);
    expect((await fetch(`${baseUrl}/not-a-uuid`, { headers })).status).toBe(400);
  });
});
