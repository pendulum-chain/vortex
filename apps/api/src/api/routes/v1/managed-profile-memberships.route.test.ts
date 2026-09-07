import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { inspect } from "node:util";
import express from "express";
import { config } from "../../../config/vars";
import logger from "../../../config/logger";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import Membership from "../../../models/managedProfileMembership.model";
import Invitation from "../../../models/managedProfileMembershipInvitation.model";
import type User from "../../../models/user.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import { SupabaseAuthService } from "../../services/auth";
import * as notifications from "../../services/email/notification.service";
import * as impersonation from "../../services/impersonation.service";
import { createManagedProfileInvitation } from "../../services/managed-profile-membership.service";
import { provisionManagedProfile } from "../../services/managed-profile-provisioning.service";
import membershipRoutes, { managedProfileInviteeRoutes } from "./managed-profile-memberships.route";

describe("managed-profile membership HTTP API", () => {
  const originalDashboardUrl = config.dashboardPublicUrl;
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;
  let owner: User;
  let invitee: User;
  let child: string;

  beforeAll(async () => {
    await setupTestDatabase();
    const app = express();
    app.use(express.json());
    app.use("/v1/managed-profiles", membershipRoutes);
    app.get("/v1/managed-profiles", (_req, res) => res.json({ lifecycle: true }));
    app.use("/v1/managed-profile-member-invitations", managedProfileInviteeRoutes);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind test server");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });
  beforeEach(async () => {
    config.dashboardPublicUrl = "https://dashboard.example.com";
    await resetTestDatabase();
    owner = await createTestUser();
    invitee = await createTestUser({ email: "stale@example.com" });
    await ManagedProfileManager.create({ allowedCorridors: ["BR"], isActive: true, profileId: owner.id });
    child = (
      await provisionManagedProfile({
        contactEmail: "child@example.com",
        creationSource: "manager",
        customerType: "individual",
        externalSubjectId: "company",
        managerProfileId: owner.id
      })
    ).profileId;
    spyOn(SupabaseAuthService, "verifyToken").mockImplementation(async token => {
      if (token === "owner") return { user_id: owner.id, email: owner.email!, valid: true };
      if (token === "invitee")
        return { user_id: invitee.id, email: "invitee@example.com", email_confirmed_at: "2026-09-01T00:00:00Z", valid: true };
      if (token === "unverified") return { user_id: invitee.id, email: "invitee@example.com", valid: true };
      if (token === "child")
        return { user_id: child, email: "invitee@example.com", email_confirmed_at: "2026-09-01T00:00:00Z", valid: true };
      return { valid: false };
    });
  });
  afterEach(() => {
    mock.restore();
    config.dashboardPublicUrl = originalDashboardUrl;
  });
  afterAll(() => server.close());

  function request(path: string, method = "GET", body?: unknown, token = "owner", extraHeaders: Record<string, string> = {}) {
    return fetch(`${baseUrl}/v1/${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json", ...extraHeaders },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  }
  const team = (suffix: string) => `managed-profiles/${child}/${suffix}`;
  const invitePath = (id: string) => `managed-profile-member-invitations/${id}`;

  it("mounts all nine endpoints and preserves the lifecycle prefix", async () => {
    expect(await (await request("managed-profiles", "GET", undefined, "")).json()).toEqual({ lifecycle: true });
    const created = await request(team("member-invitations"), "POST", { email: " Invitee@Example.com ", role: "manager" });
    expect(created.status).toBe(201);
    const { invitation } = await created.json();
    const duplicate = await request(team("member-invitations"), "POST", { email: "invitee@example.com", role: "manager" });
    expect(duplicate.status).toBe(200);
    expect((await duplicate.json()).invitation.id).toBe(invitation.id);
    const preview = await request(invitePath(invitation.id), "GET", undefined, "invitee");
    expect(preview.status).toBe(200);
    expect((await preview.json()).invitation.status).toBe("pending");
    expect((await request(`${invitePath(invitation.id)}/accept`, "POST", {}, "invitee")).status).toBe(200);
    const members = await request(team("members"));
    expect(members.status).toBe(200);
    expect((await members.json()).members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ memberProfileId: owner.id, isOwner: true }),
        expect.objectContaining({ memberProfileId: invitee.id, role: "manager", isOwner: false })
      ])
    );
    expect((await request(team(`members/${invitee.id}`), "PATCH", { role: "read_only" })).status).toBe(200);
    const invitations = await request(team("member-invitations"));
    expect((await invitations.json()).invitations[0].status).toBe("accepted");
    const events = await request(team("member-events?limit=2"));
    const eventPage = await events.json();
    expect(eventPage.events).toHaveLength(2);
    expect(eventPage.pagination.nextCursor).toBeString();
    expect((await request(team(`member-events?limit=2&cursor=${eventPage.pagination.nextCursor}`))).status).toBe(200);
    expect((await request(team(`members/${invitee.id}`), "DELETE")).status).toBe(204);
    expect((await request(team(`members/${invitee.id}`), "DELETE")).status).toBe(204);
    const fresh = await request(team("member-invitations"), "POST", { email: "invitee@example.com", role: "read_only" });
    const freshId = (await fresh.json()).invitation.id;
    expect((await request(team(`member-invitations/${freshId}`), "DELETE")).status).toBe(204);
  });

  it("requires bearer authentication on every route and rejects API credentials even with a bearer", async () => {
    const id = crypto.randomUUID();
    const paths = [
      [team("members"), "GET"],
      [team(`members/${id}`), "PATCH"],
      [team(`members/${id}`), "DELETE"],
      [team("member-invitations"), "GET"],
      [team("member-invitations"), "POST"],
      [team(`member-invitations/${id}`), "DELETE"],
      [team("member-events"), "GET"],
      [invitePath(id), "GET"],
      [`${invitePath(id)}/accept`, "POST"]
    ];
    for (const [path, method] of paths) {
      expect((await request(path, method, undefined, "")).status).toBe(401);
      expect((await request(path, method, undefined, "invalid")).status).toBe(401);
      for (const header of ["X-API-Key", "X-Public-Key"]) {
        expect((await request(path, method, undefined, "owner", { [header]: "sk_test_secret" })).status).toBe(403);
      }
    }
  });

  it("rejects impersonation for all team and invitee routes", async () => {
    spyOn(impersonation, "resolveSession").mockResolvedValue({
      actorProfileId: crypto.randomUUID(),
      targetProfileId: owner.id,
      targetEmail: owner.email!,
      sessionId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 10000)
    });
    const id = crypto.randomUUID();
    for (const [path, method] of [
      [team("members"), "GET"],
      [team(`members/${id}`), "PATCH"],
      [team(`members/${id}`), "DELETE"],
      [team("member-invitations"), "GET"],
      [team("member-invitations"), "POST"],
      [team(`member-invitations/${id}`), "DELETE"],
      [team("member-events"), "GET"],
      [invitePath(id), "GET"],
      [`${invitePath(id)}/accept`, "POST"]
    ]) {
      const response = await request(path, method, undefined, "vtx_imp_test");
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("IMPERSONATION_NOT_ALLOWED");
    }
  });

  it("rejects mismatched selectors and any invitee selector, including an empty one", async () => {
    const { invitation } = await createManagedProfileInvitation(owner.id, child, {
      email: "invitee@example.com",
      role: "manager"
    });
    expect((await request(team("members"), "GET", undefined, "owner", { "X-Managed-Profile-Id": child })).status).toBe(200);
    expect(
      (await request(team("members"), "GET", undefined, "owner", { "X-Managed-Profile-Id": crypto.randomUUID() })).status
    ).toBe(403);
    for (const selector of [child, ""]) {
      for (const [path, method] of [
        [invitePath(invitation.id), "GET"],
        [`${invitePath(invitation.id)}/accept`, "POST"]
      ]) {
        expect((await request(path, method, undefined, "invitee", { "X-Managed-Profile-Id": selector })).status).toBe(400);
      }
    }
    expect((await Invitation.findByPk(invitation.id))?.acceptedAt).toBeNull();
  });

  it("requires the exact current verified principal on preview and accept, never request email", async () => {
    const { invitation } = await createManagedProfileInvitation(owner.id, child, {
      email: "invitee@example.com",
      role: "manager"
    });
    for (const token of ["owner", "unverified", "child"]) {
      const preview = await request(invitePath(invitation.id), "GET", undefined, token);
      expect(preview.status).toBe(403);
      expect(await preview.json()).toEqual({
        error: { code: "MANAGED_PROFILE_ACCESS_DENIED", message: "Managed-profile access is denied", status: 403 }
      });
      const response = await request(
        `${invitePath(invitation.id)}/accept`,
        "POST",
        { email: "invitee@example.com", email_confirmed_at: "2026-09-01T00:00:00Z" },
        token
      );
      expect(response.status).toBe(403);
    }
    expect(
      (await request(`${invitePath(invitation.id)}/accept`, "POST", { email: "wrong@example.com" }, "invitee")).status
    ).toBe(200);
  });

  it("permits read_only reads but no member or invitation mutation", async () => {
    await Membership.create({ managedProfileId: child, memberProfileId: invitee.id, role: "read_only" });
    for (const suffix of ["members", "member-invitations", "member-events"]) {
      expect((await request(team(suffix), "GET", undefined, "invitee")).status).toBe(200);
    }
    for (const [path, method, body] of [
      [team("member-invitations"), "POST", { email: "other@example.com", role: "manager" }],
      [team(`member-invitations/${crypto.randomUUID()}`), "DELETE", undefined],
      [team(`members/${owner.id}`), "PATCH", { role: "read_only" }],
      [team(`members/${owner.id}`), "DELETE", undefined]
    ] as const) {
      const response = await request(path, method, body, "invitee");
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("MANAGED_PROFILE_MANAGER_REQUIRED");
    }
  });

  it("validates roles, identifiers, pagination limits, and cursor syntax before database access", async () => {
    const invalidRole = await request(team("member-invitations"), "POST", { email: "other@example.com", role: "owner" });
    expect(invalidRole.status).toBe(400);
    expect((await invalidRole.json()).error.code).toBe("INVALID_MEMBERSHIP_ROLE");
    expect((await request("managed-profiles/not-a-uuid/members")).status).toBe(400);
    expect((await request(team("members/not-a-uuid"), "DELETE")).status).toBe(400);
    for (const query of [
      "limit=0",
      "limit=101",
      "limit=-1",
      "limit=1.5",
      "limit=",
      "limit=1&limit=2",
      "limit=true",
      "offset=-1",
      "offset=1.5",
      "offset=9007199254740992"
    ]) {
      for (const suffix of ["members", "member-invitations", "member-events"]) {
        expect((await request(team(`${suffix}?${query}`))).status).toBe(400);
      }
    }
    for (const query of ["cursor=", "cursor=not-a-uuid", "cursor=1&cursor=2"]) {
      expect((await request(team(`member-events?${query}`))).status).toBe(400);
    }
    const page = await request(team("members?limit=1&offset=1"));
    expect(await page.json()).toMatchObject({ members: [], pagination: { limit: 1, offset: 1, total: 1 } });
  });

  it("protects the owner with typed conflicts even for uppercase UUID paths", async () => {
    for (const method of ["PATCH", "DELETE"]) {
      const response = await request(
        `managed-profiles/${child.toUpperCase()}/members/${owner.id.toUpperCase()}`,
        method,
        method === "PATCH" ? { role: "read_only" } : undefined,
        "owner",
        { "X-Managed-Profile-Id": child }
      );
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe("MANAGED_PROFILE_OWNER_MEMBERSHIP_REQUIRED");
    }
  });

  it("returns sanitised infrastructure errors without logging invitation input", async () => {
    spyOn(notifications, "enqueueManagedProfileInvitation").mockRejectedValue(
      new Error("invitee@example.com invitation-url bearer-secret")
    );
    const log = spyOn(logger, "error").mockImplementation(() => logger);
    // Other producers may log while this request runs; only our sanitised message is request-owned.
    logger.error("Unrelated background notification failure");
    const response = await request(team("member-invitations"), "POST", { email: "invitee@example.com", role: "manager" });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_SERVER_ERROR", message: "Unable to process membership request", status: 500 }
    });
    expect(log).toHaveBeenCalledWith("Managed-profile membership request failed");
    expect(
      log.mock.calls.filter(([message]) => (message as unknown) === "Managed-profile membership request failed")
    ).toHaveLength(1);
    const captured = inspect(log.mock.calls, { depth: null });
    for (const sensitive of ["invitee@example.com", "invitation-url", "bearer-secret"]) {
      expect(captured).not.toContain(sensitive);
    }
    expect(await Invitation.count()).toBe(0);
  });

  it("applies a rate limit keyed by the authenticated profile", async () => {
    let response!: Response;
    for (let i = 0; i < 121; i++) response = await request(team("members?limit=0"));
    expect(response.status).toBe(429);
    expect(response.headers.get("ratelimit-limit")).toBe("120");
    const otherActor = await request(team("members?limit=0"), "GET", undefined, "invitee");
    expect(otherActor.status).toBe(400);
  });
});
