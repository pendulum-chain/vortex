import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { AuthService } from "@/services/auth";
import { ApiError } from "./api-client";
import {
  OrganizationService as service,
  shouldRetryMembershipQuery
} from "./managed-profile-memberships.service";
import { ManagedProfilesService } from "./managed-profiles.service";

const originalFetch = globalThis.fetch;
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const values = new Map<string, string>();
const OWNER_ID = "11111111-1111-4111-8111-111111111111";
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  }
});
Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "http://localhost" } } });

const requests: Array<{ url: URL; method: string; headers: Headers; body: unknown }> = [];
beforeEach(() => {
  values.clear();
  requests.length = 0;
  AuthService.initializeAcceptedIdentitySnapshots();
  AuthService.storeTokens({
    accessToken: "human-token",
    refreshToken: "refresh",
    userId: "human",
    userEmail: "human@example.test"
  });
  AuthService.storeManagedProfileSelection({
    customerType: "business",
    externalSubjectId: "child",
    isOwner: false,
    managerProfileId: "human",
    membershipRole: "manager",
    targetEmail: "child@example.test",
    targetProfileId: "child"
  });
  globalThis.fetch = (async (input, init) => {
    requests.push({
      url: new URL(String(input)),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : undefined
    });
    return init?.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({});
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = originalFetch;
  if (originalLocalStorage) Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

describe("membership wire contract", () => {
  it("opts only bootstrap detail reads into child selection, not invitation open reads", async () => {
    await ManagedProfilesService.get("child", { bootstrap: true });
    await ManagedProfilesService.get("child");
    const [bootstrap, openProfile] = requests;
    assert.ok(bootstrap && openProfile);
    assert.equal(bootstrap.headers.get("x-managed-profile-id"), "child");
    assert.equal(openProfile.headers.get("x-managed-profile-id"), null);
    assert.equal(bootstrap.headers.get("authorization"), "Bearer human-token");
    assert.equal(openProfile.headers.get("authorization"), "Bearer human-token");
  });
  it("uses human bearer only, exact DTO bodies, and both pagination schemes", async () => {
    await service.members(OWNER_ID, 20);
    await service.invitations(OWNER_ID, 40);
    await service.events(OWNER_ID, "event-cursor");
    await service.invite(OWNER_ID, { email: "invitee@example.test", role: "read_only" });
    await service.changeRole(OWNER_ID, "member-profile", "manager");
    await service.remove(OWNER_ID, "member-profile");
    await service.cancel(OWNER_ID, "invite");
    await service.preview("invite");
    await service.accept("invite");
    await service.get();
    assert.deepEqual(requests.map(request => `${request.method} ${request.url.pathname}`), [
      "GET /v1/organization/members",
      "GET /v1/organization/member-invitations",
      "GET /v1/organization/member-events",
      "POST /v1/organization/member-invitations",
      "PATCH /v1/organization/members/member-profile",
      "DELETE /v1/organization/members/member-profile",
      "DELETE /v1/organization/member-invitations/invite",
      "GET /v1/organization-member-invitations/invite",
      "POST /v1/organization-member-invitations/invite/accept",
      "GET /v1/organization"
    ]);
    const [members, invitations, events, invite, change] = requests;
    assert.ok(members && invitations && events && invite && change);
    assert.deepEqual(Object.fromEntries(members.url.searchParams), { expectedOwnerProfileId: OWNER_ID, limit: "20", offset: "20" });
    assert.deepEqual(Object.fromEntries(invitations.url.searchParams), { expectedOwnerProfileId: OWNER_ID, limit: "20", offset: "40" });
    assert.deepEqual(Object.fromEntries(events.url.searchParams), { cursor: "event-cursor", expectedOwnerProfileId: OWNER_ID, limit: "20" });
    assert.deepEqual(invite.body, { email: "invitee@example.test", role: "read_only" });
    assert.deepEqual(change.body, { role: "manager" });
    for (const request of requests) {
      assert.deepEqual(request.url.searchParams.getAll("expectedOwnerProfileId"),
        request.url.pathname.startsWith("/v1/organization/") ? [OWNER_ID] : []);
      assert.equal(request.headers.get("authorization"), "Bearer human-token");
      assert.equal(request.headers.get("x-managed-profile-id"), null);
      assert.equal(request.headers.get("x-api-key"), null);
      assert.equal(request.headers.get("x-public-key"), null);
    }
  });

  it("blocks every endpoint during impersonation without issuing a request", async () => {
    AuthService.storeImpersonationSession({
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      sessionId: "imp",
      targetEmail: "other@example.test",
      targetProfileId: "other",
      token: "vtx_imp_token"
    });
    for (const call of [
      () => service.get(),
      () => service.members(OWNER_ID),
      () => service.invitations(OWNER_ID),
      () => service.events(OWNER_ID),
      () => service.invite(OWNER_ID, { email: "a@example.test", role: "manager" }),
      () => service.changeRole(OWNER_ID, "member", "read_only"),
      () => service.remove(OWNER_ID, "member"),
      () => service.cancel(OWNER_ID, "invite"),
      () => service.preview("invite"),
      () => service.accept("invite")
    ]) await assert.rejects(call, (error: unknown) => error instanceof ApiError && error.status === 403);
    assert.equal(requests.length, 0);
  });

  it("does not retry denials and terminal invitation conflicts", () => {
    for (const status of [400, 401, 403, 404, 409, 429]) {
      assert.equal(shouldRetryMembershipQuery(0, new ApiError(status, {}, "denied")), false);
    }
    assert.equal(shouldRetryMembershipQuery(0, new ApiError(500, {}, "failed")), true);
    assert.equal(shouldRetryMembershipQuery(2, new Error("offline")), false);
  });

  it("does not fall back to credentials without a login session", async () => {
    values.clear();
    for (const call of [
      () => service.get(),
      () => service.members(OWNER_ID),
      () => service.invitations(OWNER_ID),
      () => service.events(OWNER_ID),
      () => service.invite(OWNER_ID, { email: "a@example.test", role: "manager" }),
      () => service.changeRole(OWNER_ID, "member", "read_only"),
      () => service.remove(OWNER_ID, "member"),
      () => service.cancel(OWNER_ID, "invite")
    ]) await assert.rejects(call, ApiError);
    await assert.rejects(() => service.preview("invite"), ApiError);
    await assert.rejects(() => service.accept("invite"), ApiError);
    assert.equal(requests.length, 0);
  });

  it("preserves owner preconditions as one encoded query value on every scoped request", async () => {
    const owner = `${OWNER_ID}&expectedOwnerProfileId=another`;
    await service.members(owner);
    await service.invitations(owner);
    await service.events(owner);
    await service.invite(owner, { email: "a@example.test", role: "manager" });
    await service.changeRole(owner, "member", "read_only");
    await service.remove(owner, "member");
    await service.cancel(owner, "invite");
    assert.equal(requests.length, 7);
    for (const request of requests) assert.deepEqual(request.url.searchParams.getAll("expectedOwnerProfileId"), [owner]);
  });

  it("surfaces context changes without retrying or retargeting any scoped request", async () => {
    const recordRequest = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      await recordRequest(input, init);
      return Response.json({ error: { code: "ORGANIZATION_CONTEXT_CHANGED", message: "Organization changed" } }, { status: 409 });
    }) as typeof fetch;
    for (const call of [
      () => service.members(OWNER_ID),
      () => service.invitations(OWNER_ID),
      () => service.events(OWNER_ID),
      () => service.invite(OWNER_ID, { email: "a@example.test", role: "manager" }),
      () => service.changeRole(OWNER_ID, "member", "read_only"),
      () => service.remove(OWNER_ID, "member"),
      () => service.cancel(OWNER_ID, "invite")
    ]) await assert.rejects(call, (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.data.code, "ORGANIZATION_CONTEXT_CHANGED");
      assert.equal(shouldRetryMembershipQuery(0, error), false);
      return true;
    });
    assert.equal(requests.length, 7);
    for (const request of requests) assert.equal(request.url.searchParams.get("expectedOwnerProfileId"), OWNER_ID);
  });
});
