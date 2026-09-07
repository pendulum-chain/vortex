import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { AuthService } from "@/services/auth";
import { ApiError } from "./api-client";
import {
  ManagedProfileMembershipsService as service,
  shouldRetryMembershipQuery
} from "./managed-profile-memberships.service";
import { ManagedProfilesService } from "./managed-profiles.service";

const originalFetch = globalThis.fetch;
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const values = new Map<string, string>();
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
    await service.members("child", 20);
    await service.invitations("child", 40);
    await service.events("child", "event-cursor");
    await service.invite("child", { email: "invitee@example.test", role: "read_only" });
    await service.changeRole("child", "member-profile", "manager");
    await service.remove("child", "member-profile");
    await service.cancel("child", "invite");
    await service.preview("invite");
    await service.accept("invite");
    assert.deepEqual(requests.map(request => `${request.method} ${request.url.pathname}`), [
      "GET /v1/managed-profiles/child/members",
      "GET /v1/managed-profiles/child/member-invitations",
      "GET /v1/managed-profiles/child/member-events",
      "POST /v1/managed-profiles/child/member-invitations",
      "PATCH /v1/managed-profiles/child/members/member-profile",
      "DELETE /v1/managed-profiles/child/members/member-profile",
      "DELETE /v1/managed-profiles/child/member-invitations/invite",
      "GET /v1/managed-profile-member-invitations/invite",
      "POST /v1/managed-profile-member-invitations/invite/accept"
    ]);
    const [members, invitations, events, invite, change] = requests;
    assert.ok(members && invitations && events && invite && change);
    assert.deepEqual(Object.fromEntries(members.url.searchParams), { limit: "20", offset: "20" });
    assert.deepEqual(Object.fromEntries(invitations.url.searchParams), { limit: "20", offset: "40" });
    assert.deepEqual(Object.fromEntries(events.url.searchParams), { cursor: "event-cursor", limit: "20" });
    assert.deepEqual(invite.body, { email: "invitee@example.test", role: "read_only" });
    assert.deepEqual(change.body, { role: "manager" });
    for (const request of requests) {
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
      () => service.members("child"),
      () => service.invitations("child"),
      () => service.events("child"),
      () => service.invite("child", { email: "a@example.test", role: "manager" }),
      () => service.changeRole("child", "member", "read_only"),
      () => service.remove("child", "member"),
      () => service.cancel("child", "invite"),
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

  it("does not preview or accept an invitation without a login session", async () => {
    values.clear();
    await assert.rejects(() => service.preview("invite"), ApiError);
    await assert.rejects(() => service.accept("invite"), ApiError);
    assert.equal(requests.length, 0);
  });
});
